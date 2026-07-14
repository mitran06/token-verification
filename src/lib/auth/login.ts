import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { counters, sessions, users } from "@/db/schema";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword } from "./password";
import { SESSION_TTL_MS, generateSessionToken, hashSessionToken } from "./session";

export type AuthedUser = { id: string; username: string; role: "admin" | "reception" };

// Precomputed once so the no-such-user path spends the same time verifying as the
// real path (mitigates username enumeration via response timing).
const decoyHash = hashPassword("timing-equalizer-decoy-value");

// Staff (admin/reception) credential check. Session creation happens in the action.
export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthedUser | null> {
  const uname = username.trim().toLowerCase();
  const [u] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.username})`, uname))
    .limit(1);
  if (!u || !u.isActive) {
    await verifyPassword(await decoyHash, password).catch(() => false);
    return null;
  }
  const ok = await verifyPassword(u.passwordHash, password);
  if (!ok) return null;
  return { id: u.id, username: u.username, role: u.role };
}

export type OpenCounter = {
  id: string;
  label: string;
  status: "active" | "on_break" | "closed";
  inUse: boolean;
};

// Counters staffed today + whether each currently has a live handler session.
export async function getOpenCounters(): Promise<OpenCounter[]> {
  const rows = await db
    .select({ id: counters.id, label: counters.label, status: counters.status })
    .from(counters)
    .where(eq(counters.isOpen, true))
    .orderBy(counters.sortOrder, counters.label);
  if (rows.length === 0) return [];
  const live = await db
    .select({ counterId: sessions.counterId })
    .from(sessions)
    .where(and(eq(sessions.kind, "counter"), gt(sessions.expiresAt, new Date())));
  const busy = new Set(live.map((r) => r.counterId));
  return rows.map((r) => ({ ...r, inUse: busy.has(r.id) }));
}

export type BindResult =
  | { ok: true; token: string; expiresAt: Date; counter: { id: string; label: string } }
  | { ok: false; reason: "not_found" | "not_open" | "in_use" };

// Bind the current handler to a station. FOR UPDATE on the counter row serializes
// concurrent picks of the same station: a second handler either sees the first's
// live session (→ in_use) or must force a take-over. Take-over drops the prior
// session. Sets the station Active on success.
export async function bindCounterStation(counterId: string, force: boolean): Promise<BindResult> {
  return db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(counters)
      .where(eq(counters.id, counterId))
      .limit(1)
      .for("update");
    if (!c) return { ok: false, reason: "not_found" };
    if (!c.isOpen) return { ok: false, reason: "not_open" };

    const active = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.kind, "counter"),
          eq(sessions.counterId, counterId),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (active.length > 0) {
      if (!force) return { ok: false, reason: "in_use" };
      // Take-over: forensic trace (auth events have no token_events path).
      logger.warn({ counterId, label: c.label }, "counter station taken over");
      await tx
        .delete(sessions)
        .where(and(eq(sessions.kind, "counter"), eq(sessions.counterId, counterId)));
    }

    const token = generateSessionToken();
    const id = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await tx.insert(sessions).values({ id, kind: "counter", counterId, expiresAt });
    await tx
      .update(counters)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(counters.id, counterId));
    return { ok: true, token, expiresAt, counter: { id: c.id, label: c.label } };
  });
}

// Log a handler out of a station: drop their session; close the station if no
// other live handler remains.
export async function releaseCounter(counterId: string, sessionId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
    const remaining = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.kind, "counter"),
          eq(sessions.counterId, counterId),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (remaining.length === 0) {
      await tx
        .update(counters)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(counters.id, counterId));
    }
  });
}
