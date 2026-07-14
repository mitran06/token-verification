import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// A single pooled connection per process. Cached on globalThis so Next's dev
// HMR doesn't open a new pool on every reload. Constructing a Pool does NOT
// connect — the first query does — so importing this at build time is safe.
const globalForDb = globalThis as unknown as { __pool?: Pool };

function newPool(): Pool {
  const p = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
  });
  // Idle clients can error out (e.g. the DB restarts). Without a handler Node
  // treats it as an unhandled 'error' event and crashes the process.
  p.on("error", (err) => {
    console.error("[db] idle client error:", err.message);
  });
  return p;
}

export const pool: Pool = globalForDb.__pool ?? newPool();
if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
