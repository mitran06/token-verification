// Edge-safe (no DB / no next/headers). Imported by middleware AND server code so
// cookie names live in exactly one place.
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";

export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf";
export const COUNTER_GATE_COOKIE = "counter_gate";

export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}
