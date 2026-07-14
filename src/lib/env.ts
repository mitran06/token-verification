// Boot-time environment validation. Called from src/instrumentation.ts so the
// app FAILS TO START in production if a required secret is missing (rather than
// silently falling back to an insecure default — see gate.ts / auth audit).

const MIN_SECRET_LEN = 16;

export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const problems: string[] = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is required");
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LEN) {
    problems.push(`SESSION_SECRET is required and must be ≥ ${MIN_SECRET_LEN} chars`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Refusing to start: insecure/missing configuration:\n  - ${problems.join("\n  - ")}`,
    );
  }
}
