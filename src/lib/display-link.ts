import "server-only";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { CONFIG_KEYS, getConfig, setConfig } from "@/lib/config";

// The display wall is reached at /display/<key>, where <key> is an unguessable
// secret stored in app_config. Rotating it (admin) invalidates every old link.
function generateKey(): string {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return encodeBase32LowerCaseNoPadding(b);
}

export async function getOrCreateDisplayKey(): Promise<string> {
  const existing = await getConfig<string>(CONFIG_KEYS.displayKey);
  if (existing) return existing;
  const key = generateKey();
  await setConfig(CONFIG_KEYS.displayKey, key);
  return key;
}

export async function rotateDisplayKey(): Promise<string> {
  const key = generateKey();
  await setConfig(CONFIG_KEYS.displayKey, key);
  return key;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function verifyDisplayKey(candidate: string | null | undefined): Promise<boolean> {
  if (!candidate) return false;
  const key = await getConfig<string>(CONFIG_KEYS.displayKey);
  return !!key && timingSafeEqual(key, candidate);
}
