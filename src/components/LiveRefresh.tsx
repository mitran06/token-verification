"use client";
import { useRouter } from "next/navigation";
import { useCallback, useRef } from "react";
import { useEventStream } from "./useEventStream";

// Drop into a server-rendered page to make it live: on any queue event it
// re-runs the server component (debounced to coalesce bursts).
export function LiveRefresh({ url = "/api/events" }: { url?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEvent = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      router.refresh();
    }, 250);
  }, [router]);
  useEventStream(url, onEvent);
  return null;
}
