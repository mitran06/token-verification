import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived HMAC-signed proof that the shared counter password was entered,
// so the station-picker step (/counter/select) is authorized without creating a
// session before a station is chosen.
const GATE_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Fail closed in production — a hardcoded fallback would make the gate forgeable.
  // (Startup validation in src/lib/env.ts also blocks this, but defend in depth.)
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (>= 16 chars) is required to sign the counter gate.");
  }
  return "dev-insecure-gate-secret-change-me";
}

export function signCounterGate(now = Date.now()): string {
  const payload = String(now + GATE_TTL_MS);
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyCounterGate(value: string | undefined | null, now = Date.now()): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(sig, "base64url");
    b = Buffer.from(expected, "base64url");
  } catch {
    return false;
  }
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && now < exp;
}
