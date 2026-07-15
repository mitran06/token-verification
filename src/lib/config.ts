import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appConfig } from "@/db/schema";

// Typed key/value config (app_config table). Values are JSON.
export const CONFIG_KEYS = {
  counterPasswordHash: "counter_password_hash",
  displayKey: "display_key",
  chimeEnabled: "chime_enabled",
  actionDelaySeconds: "action_delay_seconds",
  nowServingScale: "now_serving_scale",
} as const;

// Cool-down (seconds) enforced after a counter presses Next Token / Not Arrived,
// so an accidental double-click can't advance two tokens. Admin-configurable.
export const DEFAULT_ACTION_DELAY_SECONDS = 15;

export async function getActionDelaySeconds(): Promise<number> {
  const v = await getConfig<number>(CONFIG_KEYS.actionDelaySeconds);
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 120
    ? v
    : DEFAULT_ACTION_DELAY_SECONDS;
}

// Whether the display wall chimes on a new call (admin-controlled; the wall has
// no on-screen sound button — it auto-unlocks audio on first interaction).
export async function getChimeEnabled(): Promise<boolean> {
  const v = await getConfig<boolean>(CONFIG_KEYS.chimeEnabled);
  return typeof v === "boolean" ? v : true; // default on
}

// Size of the "Now Serving" cards on the wall, 1 (small, many per row) … 5
// (huge, few per row). Admin slider. Default 3.
export const DEFAULT_NOW_SERVING_SCALE = 3;

export async function getNowServingScale(): Promise<number> {
  const v = await getConfig<number>(CONFIG_KEYS.nowServingScale);
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5
    ? v
    : DEFAULT_NOW_SERVING_SCALE;
}

export async function getConfig<T = unknown>(key: string): Promise<T | null> {
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, key)).limit(1);
  return row ? (row.value as T) : null;
}

export async function setConfig(key: string, value: unknown): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
}
