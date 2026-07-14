import { execSync } from "node:child_process";

// Clean DB → migrate → seed a strong admin, so e2e runs are deterministic.
const DB_URL = "postgres://postgres:postgres@localhost:5432/token_system";

export default async function globalSetup() {
  const env = { ...process.env, DB_OWNER_URL: DB_URL, DATABASE_URL: DB_URL };
  execSync("docker compose down -v", { stdio: "inherit" });
  execSync("docker compose up -d --wait db", { stdio: "inherit" });
  execSync("npm run migrate", { stdio: "inherit", env });
  execSync("npm run seed:admin", {
    stdio: "inherit",
    env: { ...env, SEED_ADMIN_USERNAME: "admin", SEED_ADMIN_PASSWORD: "Str0ngAdminPass" },
  });
  // A few applicants for the queue flow.
  execSync(
    `docker compose exec -T db psql -U postgres -d token_system -c ` +
      `"INSERT INTO applications (application_number, application_name) VALUES ` +
      `('APP001','Alice Anand'),('APP002','Bharat Bose'),('APP003','Chetan Chopra');"`,
    { stdio: "inherit" },
  );
}
