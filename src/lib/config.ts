import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appConfig } from "@/db/schema";

// Typed key/value config (app_config table). Values are JSON.
export const CONFIG_KEYS = {
  counterPasswordHash: "counter_password_hash",
  displayKey: "display_key",
  chimeEnabled: "chime_enabled",
} as const;

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
