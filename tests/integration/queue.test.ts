import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let container: StartedPostgreSqlContainer;
let db: (typeof import("@/db"))["db"];
let pool: (typeof import("@/db"))["pool"];
let schema: typeof import("@/db/schema");
let q: typeof import("@/lib/queue/queue");

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17").start();
  process.env.DATABASE_URL = container.getConnectionUri();
  const mp = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(mp), { migrationsFolder: "./drizzle" });
  await mp.end();
  const dbMod = await import("@/db");
  db = dbMod.db;
  pool = dbMod.pool;
  schema = await import("@/db/schema");
  q = await import("@/lib/queue/queue");
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

// Clean queue state between tests (keep it independent).
beforeEach(async () => {
  await db.delete(schema.tokenEvents);
  await db.delete(schema.tokens);
  await db.delete(schema.dailySequences);
  await db.delete(schema.counters);
  await db.delete(schema.applications);
});

async function seedApplication(n: string, name = `Applicant ${n}`) {
  await db.insert(schema.applications).values({ applicationNumber: n, applicationName: name });
}
async function seedActiveCounter(label: string) {
  const [c] = await db
    .insert(schema.counters)
    .values({ label, isOpen: true, status: "active" })
    .returning();
  return c;
}

describe("daily numbering", () => {
  it("increments within a day and resets to 1 on a new day", async () => {
    await db.transaction(async (tx) => {
      expect(await q.allocateDayNumber(tx, "2026-07-11")).toBe(1);
      expect(await q.allocateDayNumber(tx, "2026-07-11")).toBe(2);
      expect(await q.allocateDayNumber(tx, "2026-07-11")).toBe(3);
      expect(await q.allocateDayNumber(tx, "2026-07-12")).toBe(1);
    });
  });
});

describe("generateToken", () => {
  it("rejects unknown applicants, numbers sequentially, blocks duplicate live tokens", async () => {
    await seedApplication("A1");
    await seedApplication("A2");

    expect(await q.generateToken("NOPE")).toMatchObject({ ok: false, reason: "unknown_application" });

    const r1 = await q.generateToken("A1");
    expect(r1).toMatchObject({ ok: true });
    if (r1.ok) expect(r1.token.tokenNumber).toBe(1);

    const r2 = await q.generateToken("A2");
    if (r2.ok) expect(r2.token.tokenNumber).toBe(2);

    // A1 already has a live token
    expect(await q.generateToken("A1")).toMatchObject({ ok: false, reason: "duplicate" });
  });
});

describe("counter servicing", () => {
  it("gates on active status, serves current then claims next, handles empty queue", async () => {
    await seedApplication("A1");
    await seedApplication("A2");
    await q.generateToken("A1");
    await q.generateToken("A2");
    const c = await seedActiveCounter("Counter 1");

    const first = await q.nextToken(c.id);
    expect(first).toMatchObject({ ok: true });
    if (first.ok) expect(first.token?.tokenNumber).toBe(1);
    expect((await q.getCounterCurrent(c.id))?.tokenNumber).toBe(1);

    // second Next: serves #1, assigns #2
    const second = await q.nextToken(c.id);
    if (second.ok) expect(second.token?.tokenNumber).toBe(2);
    const served = await db
      .select()
      .from(schema.tokens)
      .where(and(eq(schema.tokens.tokenNumber, 1), eq(schema.tokens.status, "served")));
    expect(served.length).toBe(1);

    // third Next: nothing queued → current (#2) served, returns null
    const third = await q.nextToken(c.id);
    expect(third).toMatchObject({ ok: true });
    if (third.ok) expect(third.token).toBeNull();
    expect(await q.getCounterCurrent(c.id)).toBeNull();
  });

  it("rejects Next when the counter is not active", async () => {
    const c = await seedActiveCounter("Counter X");
    await db.update(schema.counters).set({ status: "closed" }).where(eq(schema.counters.id, c.id));
    expect(await q.nextToken(c.id)).toMatchObject({ ok: false, reason: "not_active" });
  });

  it("Not Arrived moves current to missed then claims next; prioritize re-queues it", async () => {
    await seedApplication("A1");
    await seedApplication("A2");
    await q.generateToken("A1"); // #1
    await q.generateToken("A2"); // #2
    const c = await seedActiveCounter("Counter 1");

    await q.nextToken(c.id); // holds #1
    const na = await q.notArrived(c.id); // #1 → missed, claims #2
    if (na.ok) expect(na.token?.tokenNumber).toBe(2);

    const missed = await q.getNotArrivedTokens();
    expect(missed.map((m) => m.tokenNumber)).toEqual([1]);

    const pri = await q.prioritizeToken(missed[0].id);
    expect(pri).toMatchObject({ ok: true });
    const queued = await q.getQueuedTokens();
    expect(queued.map((x) => x.tokenNumber)).toContain(1); // back in the queue
  });

  it("going on break returns the held token to the queue", async () => {
    await seedApplication("A1");
    await q.generateToken("A1");
    const c = await seedActiveCounter("Counter 1");
    await q.nextToken(c.id); // holds #1
    await q.setCounterStatus(c.id, "on_break");
    expect(await q.getCounterCurrent(c.id)).toBeNull();
    expect((await q.getQueuedTokens()).map((x) => x.tokenNumber)).toEqual([1]);
    const [cc] = await db.select().from(schema.counters).where(eq(schema.counters.id, c.id));
    expect(cc.status).toBe("on_break");
  });
});

describe("display board (getBoard)", () => {
  it("shows only currently-assigned tokens; served and not-arrived drop off", async () => {
    for (let i = 1; i <= 3; i++) await seedApplication(`A${i}`);
    for (let i = 1; i <= 3; i++) await q.generateToken(`A${i}`); // queued 1,2,3
    const c1 = await seedActiveCounter("Counter 1");
    const c2 = await seedActiveCounter("Counter 2");

    await q.nextToken(c1.id); // c1 holds #1
    await q.nextToken(c2.id); // c2 holds #2

    let board = await q.getBoard();
    expect(board.calls.map((x) => x.tokenNumber).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(board.queued.map((x) => x.tokenNumber)).toEqual([3]);
    expect(board.missed.length).toBe(0);

    await q.nextToken(c1.id); // serves #1, claims #3 → c1 holds #3, #1 served
    board = await q.getBoard();
    const nums = board.calls.map((x) => x.tokenNumber).sort((a, b) => a - b);
    expect(nums).toEqual([2, 3]); // #1 (served) no longer on the wall
    expect(nums).not.toContain(1);

    await q.notArrived(c2.id); // #2 → not_arrived (queue empty)
    board = await q.getBoard();
    expect(board.calls.map((x) => x.tokenNumber)).toEqual([3]); // only #3 still assigned
    expect(board.missed.map((x) => x.tokenNumber)).toEqual([2]); // #2 moved to missed
  });
});

describe("delete + reopen with audit", () => {
  it("delete removes the token but keeps an audit event; reopen revives a served token", async () => {
    await seedApplication("A1");
    const g = await q.generateToken("A1");
    const [tok] = await db.select().from(schema.tokens);
    expect(g.ok).toBe(true);

    await q.deleteToken(tok.id);
    expect((await db.select().from(schema.tokens)).length).toBe(0);
    const del = await db
      .select()
      .from(schema.tokenEvents)
      .where(eq(schema.tokenEvents.eventType, "deleted"));
    expect(del.length).toBe(1);
    expect(del[0].tokenNumber).toBe(1); // snapshot survived the delete

    // reopen path
    await seedApplication("A2");
    await q.generateToken("A2");
    const c = await seedActiveCounter("Counter 1");
    await q.nextToken(c.id); // assign #2
    await q.nextToken(c.id); // serve #2 (queue empty)
    const [served] = await db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.status, "served"));
    expect(await q.reopenToken(served.id)).toMatchObject({ ok: true });
    const [after] = await db.select().from(schema.tokens).where(eq(schema.tokens.id, served.id));
    expect(after.status).toBe("queued");
  });
});

describe("CONCURRENCY — no double assignment", () => {
  it("N counters claiming simultaneously each get a DISTINCT token", async () => {
    for (let i = 1; i <= 5; i++) await seedApplication(`A${i}`);
    for (let i = 1; i <= 5; i++) await q.generateToken(`A${i}`); // queue: 1..5
    const counters = [];
    for (let i = 1; i <= 5; i++) counters.push(await seedActiveCounter(`Counter ${i}`));

    const results = await Promise.all(counters.map((c) => q.nextToken(c.id)));
    const numbers = results
      .map((r) => (r.ok ? r.token?.tokenNumber : undefined))
      .filter((n): n is number => n !== undefined);

    expect(numbers.length).toBe(5);
    expect(new Set(numbers).size).toBe(5); // all distinct — no double assignment
    expect([...numbers].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);

    const assigned = await db
      .select()
      .from(schema.tokens)
      .where(eq(schema.tokens.status, "assigned"));
    expect(assigned.length).toBe(5);
    expect(new Set(assigned.map((t) => t.assignedTo)).size).toBe(5); // one per counter
  });

  it("more counters than tokens → extras get null, no errors", async () => {
    for (let i = 1; i <= 3; i++) await seedApplication(`A${i}`);
    for (let i = 1; i <= 3; i++) await q.generateToken(`A${i}`); // 3 queued
    const counters = [];
    for (let i = 1; i <= 5; i++) counters.push(await seedActiveCounter(`Counter ${i}`));

    const results = await Promise.all(counters.map((c) => q.nextToken(c.id)));
    const got = results.filter((r) => r.ok && r.token !== null).length;
    const empty = results.filter((r) => r.ok && r.token === null).length;
    expect(got).toBe(3);
    expect(empty).toBe(2);
  });
});

describe("replaceApplications (CSV import)", () => {
  it("replaces the entire roster in a transaction", async () => {
    const { replaceApplications } = await import("@/lib/csv/import");
    await seedApplication("OLD1", "Old One");
    const n = await replaceApplications([
      { applicationNumber: "N1", applicationName: "New One" },
      { applicationNumber: "N2", applicationName: "New Two" },
    ]);
    expect(n).toBe(2);
    const all = await db.select().from(schema.applications);
    expect(all.map((a) => a.applicationNumber).sort()).toEqual(["N1", "N2"]);
  });
});
