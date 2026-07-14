import "server-only";
import { headers } from "next/headers";

// Client IP for rate-limit keys. Behind the Cloudflare Tunnel the ONLY
// trustworthy source is CF-Connecting-IP (Cloudflare overwrites any client-sent
// value). X-Forwarded-For is client-spoofable, so it must not be trusted for a
// security control — prefer the Cloudflare headers, fall back only for local dev.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const cf = h.get("cf-connecting-ip") ?? h.get("true-client-ip");
  if (cf) return cf.trim();
  const xreal = h.get("x-real-ip");
  if (xreal) return xreal.trim();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "local";
}
