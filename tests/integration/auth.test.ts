import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Real Postgres so the FOR UPDATE / take-over / expiry behaviour is genuinely
// exercised. DATABASE_URL must be set BEFORE @/db is first imported (its pool
// reads it at construction), so the modules under test are imported dynamically.
let container: StartedPostgreSqlContainer;
let db: (typeof import("@/db"))["db"];
let pool: (typeof import("@/db"))["pool"];
let schema: typeof import("@/db/schema");
let session: typeof import("@/lib/auth/session");
let login: typeof import("@/lib/auth/login");
let password: typeof import("@/lib/auth/password");

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:17").start();
  process.env.DATABASE_URL = container.getConnectionUri();

  const migratePool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(migratePool), { migrationsFolder: "./drizzle" });
  await migratePool.end();

  const dbMod = await import("@/db");
  db = dbMod.db;
  pool = dbMod.pool;
  schema = await import("@/db/schema");
  session = await import("@/lib/auth/session");
  login = await import("@/lib/auth/login");
  password = await import("@/lib/auth/password");
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await password.hashPassword("s3cret-pw");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await password.verifyPassword(h, "s3cret-pw")).toBe(true);
    expect(await password.verifyPassword(h, "wrong")).toBe(false);
  });
});

describe("authenticateUser", () => {
  it("accepts valid creds (case-insensitive username), rejects bad + inactive", async () => {
    const passwordHash = await password.hashPassword("recept-pw");
    const [u] = await db
      .insert(schema.users)
      .values({ username: "Reception", role: "reception", passwordHash })
      .returning();

    expect(await login.authenticateUser("reception", "recept-pw")).toMatchObject({
      id: u.id,
      role: "reception",
    });
    expect(await login.authenticateUser("reception", "nope")).toBeNull();

    await db.update(schema.users).set({ isActive: false }).where(eq(schema.users.id, u.id));
    expect(await login.authenticateUser("reception", "recept-pw")).toBeNull();
  });
});

describe("sessions", () => {
  it("creates, validates, expires (and cleans up), rejects unknown tokens", async () => {
    const passwordHash = await password.hashPassword("x");
    const [u] = await db
      .insert(schema.users)
      .values({ username: "admin1", role: "admin", passwordHash })
      .returning();

    const { token } = await session.createUserSession(u.id);
    const ctx = await session.validateSessionToken(token);
    expect(ctx?.kind).toBe("user");
    if (ctx?.kind === "user") expect(ctx.user.id).toBe(u.id);

    expect(await session.validateSessionToken("bogus-token")).toBeNull();

    const id = session.hashSessionToken(token);
    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, id));
    expect(await session.validateSessionToken(token)).toBeNull();
    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    expect(rows.length).toBe(0); // expired session was deleted
  });
});

describe("counter station binding", () => {
  it("binds, activates, blocks double-bind, supports take-over, rejects closed", async () => {
    const [open] = await db
      .insert(schema.counters)
      .values({ label: "Counter A", isOpen: true, sortOrder: 1 })
      .returning();
    const [closed] = await db
      .insert(schema.counters)
      .values({ label: "Counter B", isOpen: false, sortOrder: 2 })
      .returning();

    const r1 = await login.bindCounterStation(open.id, false);
    expect(r1.ok).toBe(true);
    const [c1] = await db.select().from(schema.counters).where(eq(schema.counters.id, open.id));
    expect(c1.status).toBe("active");

    const r2 = await login.bindCounterStation(open.id, false);
    expect(r2).toMatchObject({ ok: false, reason: "in_use" });

    const r3 = await login.bindCounterStation(open.id, true); // take over
    expect(r3.ok).toBe(true);
    const live = await db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.kind, "counter"), eq(schema.sessions.counterId, open.id)));
    expect(live.length).toBe(1); // old session dropped

    expect(await login.bindCounterStation(closed.id, false)).toMatchObject({
      ok: false,
      reason: "not_open",
    });
  });

  it("serializes concurrent picks of the same station — exactly one bind", async () => {
    const [c] = await db
      .insert(schema.counters)
      .values({ label: "Counter Race", isOpen: true, sortOrder: 3 })
      .returning();

    const results = await Promise.all([
      login.bindCounterStation(c.id, false),
      login.bindCounterStation(c.id, false),
      login.bindCounterStation(c.id, false),
    ]);
    expect(results.filter((r) => r.ok).length).toBe(1);

    const live = await db
      .select()
      .from(schema.sessions)
      .where(and(eq(schema.sessions.kind, "counter"), eq(schema.sessions.counterId, c.id)));
    expect(live.length).toBe(1);
  });

  it("releaseCounter drops the session and closes the station", async () => {
    const [c] = await db
      .insert(schema.counters)
      .values({ label: "Counter Rel", isOpen: true, sortOrder: 4 })
      .returning();
    const r = await login.bindCounterStation(c.id, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    await login.releaseCounter(c.id, session.hashSessionToken(r.token));
    const [after] = await db.select().from(schema.counters).where(eq(schema.counters.id, c.id));
    expect(after.status).toBe("closed");
    const sess = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, session.hashSessionToken(r.token)));
    expect(sess.length).toBe(0);
  });
});
