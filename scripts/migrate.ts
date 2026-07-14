import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Run on deploy (owner role) before the server starts.
async function main() {
  const url = process.env.DB_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DB_OWNER_URL or DATABASE_URL is required");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("✓ migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("migration failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
