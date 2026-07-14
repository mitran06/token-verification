import { execSync } from "node:child_process";

export default async function globalTeardown() {
  try {
    execSync("docker compose down -v", { stdio: "inherit" });
  } catch {
    // best-effort
  }
}
