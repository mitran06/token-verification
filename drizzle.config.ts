import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DB_OWNER_URL ??
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/token_system",
  },
});
