import "dotenv/config";
import { lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sessions } from "../src/db/schema";

// Sweep expired sessions. Run from cron (host or a compose sidecar) — hourly is
// plenty given the 12h TTL. Expired rows are already rejected at validation time;
// this is DB hygiene.
async function main() {
  const url = process.env.DB_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DB_OWNER_URL or DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const deleted = await drizzle(pool)
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .returning({ id: sessions.id });
    console.log(`✓ deleted ${deleted.length} expired sessions`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("cleanup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
