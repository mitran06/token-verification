"use client";
import { useEffect } from "react";

// Subscribe to an SSE endpoint; call onEvent on each message. EventSource
// auto-reconnects on drop.
export function useEventStream(url: string, onEvent: () => void): void {
  useEffect(() => {
    const es = new EventSource(url);
    es.onmessage = () => onEvent();
    es.onerror = () => {
      // let EventSource handle reconnection (retry hint sent by the server)
    };
    return () => es.close();
  }, [url, onEvent]);
}
