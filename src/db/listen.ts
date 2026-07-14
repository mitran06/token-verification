import "server-only";
import { Client } from "pg";
import { EVENTS_CHANNEL } from "@/lib/queue/queue";
import { hub } from "@/lib/realtime/hub";

// One dedicated LISTEN connection (not from the pool) that re-broadcasts
// pg_notify payloads to all SSE subscribers. Started lazily on the first SSE
// connection; on error it resets so the next connection reconnects.
const g = globalThis as unknown as { __listening?: boolean };

export async function ensureListening(): Promise<void> {
  if (g.__listening) return;
  g.__listening = true;
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.on("notification", (msg) => {
      if (msg.payload) hub.broadcast(msg.payload);
    });
    client.on("error", (e: unknown) => {
      console.error("[listen] client error:", e instanceof Error ? e.message : e);
      g.__listening = false;
    });
    client.on("end", () => {
      g.__listening = false;
    });
    await client.connect();
    await client.query(`LISTEN ${EVENTS_CHANNEL}`);
  } catch (e) {
    g.__listening = false;
    throw e;
  }
}
