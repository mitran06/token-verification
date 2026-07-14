import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { users } from "../src/db/schema";
import { assertStrongAdminPassword, hashPassword } from "../src/lib/auth/password";

// Idempotent: seeds the first admin from env, then does nothing once an admin
// exists. Remove the SEED_ADMIN_* vars after the first run.
async function main() {
  const username = process.env.SEED_ADMIN_USERNAME?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const url = process.env.DB_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DB_OWNER_URL or DATABASE_URL is required");
  if (!username || !password) {
    console.log("SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD not set — skipping admin seed");
    return;
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
    if (existing.length > 0) {
      console.log("✓ an admin already exists — skipping");
      return;
    }
    assertStrongAdminPassword(password);
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({ username, role: "admin", passwordHash });
    console.log(`✓ seeded admin '${username}'`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("seed-admin failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
