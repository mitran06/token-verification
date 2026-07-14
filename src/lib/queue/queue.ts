import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { applications, counters, tokenEvents, tokens } from "@/db/schema";
import { businessDay } from "./time";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const LIVE = ["queued", "assigned", "not_arrived"] as const;
export const EVENTS_CHANNEL = "app_events";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

// pg_notify inside the transaction → delivered to LISTENers only on commit, so
// SSE subscribers never see a change that rolled back.
async function notify(tx: Tx, type: "queue" | "counter"): Promise<void> {
  await tx.execute(sql`SELECT pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify({ type })})`);
}

// Authoritative per-IST-day counter. The row lock on the upsert serializes
// concurrent generates; state lives in the DB so it survives restarts and rolls
// to 1 automatically on the first token of a new day.
export async function allocateDayNumber(tx: Tx, day: string): Promise<number> {
  const res = await tx.execute(sql`
    INSERT INTO daily_sequences (business_day, last_number) VALUES (${day}, 1)
    ON CONFLICT (business_day) DO UPDATE SET last_number = daily_sequences.last_number + 1
    RETURNING last_number`);
  return Number((res.rows[0] as { last_number: number }).last_number);
}

export type TokenView = {
  tokenNumber: number;
  applicationNumber: string;
  applicationName: string;
};

export type GenerateResult =
  | { ok: true; token: TokenView }
  | { ok: false; reason: "unknown_application" | "duplicate" };

// Reception issues a token for an applicant. Dup prevented both by a cheap
// pre-check and the partial unique index (races). Name is snapshotted onto the
// token so a later roster replace never disturbs it.
export async function generateToken(
  applicationNumber: string,
  actorUserId?: string,
): Promise<GenerateResult> {
  const day = businessDay();
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select()
      .from(applications)
      .where(eq(applications.applicationNumber, applicationNumber))
      .limit(1);
    if (!app) return { ok: false, reason: "unknown_application" };

    const [existing] = await tx
      .select({ id: tokens.id })
      .from(tokens)
      .where(
        and(
          eq(tokens.businessDay, day),
          eq(tokens.applicationNumber, applicationNumber),
          inArray(tokens.status, LIVE),
        ),
      )
      .limit(1);
    if (existing) return { ok: false, reason: "duplicate" };

    const number = await allocateDayNumber(tx, day);
    try {
      const [t] = await tx
        .insert(tokens)
        .values({
          businessDay: day,
          tokenNumber: number,
          applicationNumber,
          applicationName: app.applicationName,
          status: "queued",
        })
        .returning();
      await tx.insert(tokenEvents).values({
        tokenId: t.id,
        tokenNumber: t.tokenNumber,
        applicationNumber,
        eventType: "generated",
        toStatus: "queued",
        actorUserId,
      });
      await notify(tx, "queue");
      return {
        ok: true,
        token: {
          tokenNumber: t.tokenNumber,
          applicationNumber,
          applicationName: t.applicationName,
        },
      };
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, reason: "duplicate" };
      throw e;
    }
  });
}

// The atomic claim: FOR UPDATE SKIP LOCKED means concurrent counters each grab a
// DIFFERENT queued row (or none) — no double-assignment. Serves the counter's
// current token first (parity with the legacy "Next" button).
async function claimNext(tx: Tx, day: string, counterId: string): Promise<TokenView | null> {
  const res = await tx.execute(sql`
    WITH picked AS (
      SELECT id FROM tokens
      WHERE business_day = ${day} AND status = 'queued'
      ORDER BY token_number
      FOR UPDATE SKIP LOCKED
      LIMIT 1)
    UPDATE tokens t
    SET status = 'assigned', assigned_to = ${counterId}, assigned_at = now(), updated_at = now()
    FROM picked WHERE t.id = picked.id
    RETURNING t.id, t.token_number, t.application_number, t.application_name`);
  if (res.rows.length === 0) return null;
  const r = res.rows[0] as {
    id: string;
    token_number: number;
    application_number: string;
    application_name: string;
  };
  await tx.insert(tokenEvents).values({
    tokenId: r.id,
    tokenNumber: r.token_number,
    applicationNumber: r.application_number,
    eventType: "assigned",
    fromStatus: "queued",
    toStatus: "assigned",
    actorCounterId: counterId,
  });
  return {
    tokenNumber: r.token_number,
    applicationNumber: r.application_number,
    applicationName: r.application_name,
  };
}

async function disposeCurrent(
  tx: Tx,
  day: string,
  counterId: string,
  to: "served" | "not_arrived" | "queued",
): Promise<void> {
  const setClause =
    to === "served"
      ? sql`status = 'served', served_at = now(), updated_at = now()`
      : to === "queued"
        ? sql`status = 'queued', assigned_to = NULL, updated_at = now()`
        : sql`status = 'not_arrived', updated_at = now()`;
  const res = await tx.execute(sql`
    UPDATE tokens SET ${setClause}
    WHERE assigned_to = ${counterId} AND status = 'assigned' AND business_day = ${day}
    RETURNING id, token_number, application_number`);
  const eventType = to === "served" ? "served" : to === "queued" ? "prioritized" : "not_arrived";
  for (const row of res.rows as Array<{
    id: string;
    token_number: number;
    application_number: string;
  }>) {
    await tx.insert(tokenEvents).values({
      tokenId: row.id,
      tokenNumber: row.token_number,
      applicationNumber: row.application_number,
      eventType,
      fromStatus: "assigned",
      toStatus: to,
      actorCounterId: counterId,
    });
  }
}

export type ClaimResult =
  | { ok: true; token: TokenView | null }
  | { ok: false; reason: "not_active" };

async function serveAndClaim(
  counterId: string,
  dispose: "served" | "not_arrived",
): Promise<ClaimResult> {
  const day = businessDay();
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select({ status: counters.status })
      .from(counters)
      .where(eq(counters.id, counterId))
      .limit(1)
      .for("update");
    if (!c || c.status !== "active") return { ok: false, reason: "not_active" };
    await disposeCurrent(tx, day, counterId, dispose);
    const token = await claimNext(tx, day, counterId);
    await notify(tx, "queue");
    return { ok: true, token };
  });
}

// "Next Token": serve current, then claim the next queued token.
export function nextToken(counterId: string): Promise<ClaimResult> {
  return serveAndClaim(counterId, "served");
}

// "Not Arrived": mark current a no-show, then claim the next queued token.
export function notArrived(counterId: string): Promise<ClaimResult> {
  return serveAndClaim(counterId, "not_arrived");
}

// On break/close, return the held token to the queue (no applicant lost).
export async function setCounterStatus(
  counterId: string,
  status: "active" | "on_break" | "closed",
): Promise<void> {
  const day = businessDay();
  await db.transaction(async (tx) => {
    if (status !== "active") await disposeCurrent(tx, day, counterId, "queued");
    await tx
      .update(counters)
      .set({ status, updatedAt: new Date() })
      .where(eq(counters.id, counterId));
    await notify(tx, "counter");
  });
}

export type SimpleResult = { ok: true } | { ok: false; reason: string };

// Reception recalls a missed token to the front of the queue (its low number
// sorts ahead of newer tokens). Clears the stale assigned_to.
export async function prioritizeToken(tokenId: string, actorUserId?: string): Promise<SimpleResult> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1).for("update");
    if (!t) return { ok: false, reason: "not_found" };
    if (t.status !== "not_arrived") return { ok: false, reason: "not_missed" };
    await tx
      .update(tokens)
      .set({ status: "queued", assignedTo: null, updatedAt: new Date() })
      .where(eq(tokens.id, tokenId));
    await tx.insert(tokenEvents).values({
      tokenId,
      tokenNumber: t.tokenNumber,
      applicationNumber: t.applicationNumber,
      eventType: "prioritized",
      fromStatus: "not_arrived",
      toStatus: "queued",
      actorUserId,
    });
    await notify(tx, "queue");
    return { ok: true };
  });
}

// Hard delete (parity), but write the audit event first (snapshot survives via
// the SET NULL FK + snapshot columns).
export async function deleteToken(tokenId: string, actorUserId?: string): Promise<SimpleResult> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1);
    if (!t) return { ok: false, reason: "not_found" };
    await tx.insert(tokenEvents).values({
      tokenId: t.id,
      tokenNumber: t.tokenNumber,
      applicationNumber: t.applicationNumber,
      eventType: "deleted",
      fromStatus: t.status,
      actorUserId,
    });
    await tx.delete(tokens).where(eq(tokens.id, tokenId));
    await notify(tx, "queue");
    return { ok: true };
  });
}

// Admin reopens a mistakenly-served token (blocked if a live token already
// exists for that applicant).
export async function reopenToken(tokenId: string, actorUserId?: string): Promise<SimpleResult> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tokens).where(eq(tokens.id, tokenId)).limit(1).for("update");
    if (!t) return { ok: false, reason: "not_found" };
    if (t.status !== "served") return { ok: false, reason: "not_served" };
    try {
      await tx
        .update(tokens)
        .set({ status: "queued", assignedTo: null, updatedAt: new Date() })
        .where(eq(tokens.id, tokenId));
    } catch (e) {
      if (isUniqueViolation(e)) return { ok: false, reason: "duplicate_live" };
      throw e;
    }
    await tx.insert(tokenEvents).values({
      tokenId,
      tokenNumber: t.tokenNumber,
      applicationNumber: t.applicationNumber,
      eventType: "reopened",
      fromStatus: "served",
      toStatus: "queued",
      actorUserId,
    });
    await notify(tx, "queue");
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Reads (day-scoped so served history never bloats the hot path)
// ---------------------------------------------------------------------------
export async function getCounterCurrent(counterId: string): Promise<TokenView | null> {
  const [t] = await db
    .select({
      tokenNumber: tokens.tokenNumber,
      applicationNumber: tokens.applicationNumber,
      applicationName: tokens.applicationName,
    })
    .from(tokens)
    .where(
      and(
        eq(tokens.assignedTo, counterId),
        eq(tokens.status, "assigned"),
        eq(tokens.businessDay, businessDay()),
      ),
    )
    .limit(1);
  return t ?? null;
}

export async function getQueuedTokens(): Promise<TokenView[]> {
  return db
    .select({
      tokenNumber: tokens.tokenNumber,
      applicationNumber: tokens.applicationNumber,
      applicationName: tokens.applicationName,
    })
    .from(tokens)
    .where(and(eq(tokens.businessDay, businessDay()), eq(tokens.status, "queued")))
    .orderBy(asc(tokens.tokenNumber));
}

export type AdminToken = TokenView & {
  id: string;
  status: "queued" | "assigned" | "served" | "not_arrived";
};
export async function getTodayTokens(): Promise<AdminToken[]> {
  return db
    .select({
      id: tokens.id,
      tokenNumber: tokens.tokenNumber,
      applicationNumber: tokens.applicationNumber,
      applicationName: tokens.applicationName,
      status: tokens.status,
    })
    .from(tokens)
    .where(eq(tokens.businessDay, businessDay()))
    .orderBy(asc(tokens.tokenNumber));
}

export type MissedToken = TokenView & { id: string };
export async function getNotArrivedTokens(): Promise<MissedToken[]> {
  return db
    .select({
      id: tokens.id,
      tokenNumber: tokens.tokenNumber,
      applicationNumber: tokens.applicationNumber,
      applicationName: tokens.applicationName,
    })
    .from(tokens)
    .where(and(eq(tokens.businessDay, businessDay()), eq(tokens.status, "not_arrived")))
    .orderBy(asc(tokens.tokenNumber));
}

// ---------------------------------------------------------------------------
// Board (display wall): open counters + their current token, plus missed/queued.
// ---------------------------------------------------------------------------
// A "call" = a token that a counter has been assigned/served, newest first.
// The wall renders these so the just-called token lands top-left and flashes.
export type Call = { tokenNumber: number; counterLabel: string };
export type Board = {
  calls: Call[];
  queued: TokenView[];
  missed: TokenView[];
  openCounters: number;
};

export async function getBoard(): Promise<Board> {
  const day = businessDay();
  const calls = await db
    .select({ tokenNumber: tokens.tokenNumber, counterLabel: counters.label })
    .from(tokens)
    .innerJoin(counters, eq(tokens.assignedTo, counters.id))
    .where(and(eq(tokens.businessDay, day), isNotNull(tokens.assignedAt)))
    .orderBy(desc(tokens.assignedAt))
    .limit(24);
  const [{ open }] = await db
    .select({ open: sql<number>`count(*)::int` })
    .from(counters)
    .where(eq(counters.isOpen, true));
  const queued = await getQueuedTokens();
  const missed = await getNotArrivedTokens();
  return { calls, queued, missed, openCounters: Number(open) };
}
