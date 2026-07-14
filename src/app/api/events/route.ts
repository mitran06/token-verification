import type { NextRequest } from "next/server";
import { ensureListening } from "@/db/listen";
import { getAuth } from "@/lib/auth/rbac";
import { verifyDisplayKey } from "@/lib/display-link";
import { hub } from "@/lib/realtime/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Server-Sent Events. Authorized by a staff/counter session OR a valid display
// key. Pushes the raw pg_notify payload; clients refetch authoritative state.
export async function GET(req: NextRequest) {
  const d = new URL(req.url).searchParams.get("d");
  const authed = (await getAuth()) !== null;
  const displayOk = await verifyDisplayKey(d);
  if (!authed && !displayOk) return new Response("unauthorized", { status: 401 });

  await ensureListening().catch(() => {});

  const encoder = new TextEncoder();
  let unsub = () => {};
  let ping: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const enqueue = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          // stream already closed
        }
      };
      enqueue("retry: 3000\n\n");
      unsub = hub.subscribe((data) => enqueue(`data: ${data}\n\n`));
      ping = setInterval(() => enqueue(": ping\n\n"), 25_000); // keep the tunnel warm
      req.signal.addEventListener("abort", () => {
        if (ping) clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
