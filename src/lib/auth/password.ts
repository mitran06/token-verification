import { hash, verify } from "@node-rs/argon2";
import { AuthError } from "./errors";

// OWASP baseline (19 MiB, t=2, p=1). @node-rs/argon2 defaults to argon2id, so we
// leave `algorithm` unset (its const-enum export can't be referenced under
// isolatedModules) and pin the cost parameters explicitly.
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export function verifyPassword(digest: string, password: string): Promise<boolean> {
  return verify(digest, password);
}

// A tiny blocklist of obvious choices — not exhaustive, just a guardrail for the
// one high-value credential.
const COMMON = new Set([
  "password",
  "password1",
  "password123",
  "admin",
  "admin123",
  "administrator",
  "12345678",
  "123456789",
  "qwerty123",
  "changeme",
  "letmein123",
]);

// Admin can replace the roster and reset everything → its password is enforced.
export function assertStrongAdminPassword(password: string): string {
  const missing: string[] = [];
  if (password.length < 12) missing.push("at least 12 characters");
  if (!/[a-z]/.test(password)) missing.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) missing.push("an uppercase letter");
  if (!/[0-9]/.test(password)) missing.push("a number");
  if (missing.length > 0) {
    throw new AuthError(`Admin password needs ${missing.join(", ")}.`);
  }
  if (COMMON.has(password.toLowerCase())) {
    throw new AuthError("That admin password is too common — choose another.");
  }
  return password;
}

// Reception + the shared counter password may stay simple (user's decision) —
// just non-empty. Rate-limiting is the brute-force defense for these.
export function assertNonEmptyPassword(password: string): string {
  if (!password || password.length < 1) {
    throw new AuthError("Password is required.");
  }
  return password;
}
