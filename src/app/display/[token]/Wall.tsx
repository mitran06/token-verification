"use client";
import { useCallback, useRef, useState } from "react";
import { useChime } from "@/components/useChime";
import { useEventStream } from "@/components/useEventStream";

type Cur = { tokenNumber: number; applicationNumber: string; applicationName: string } | null;
type BoardCounter = { id: string; label: string; status: "active" | "on_break" | "closed"; current: Cur };
type TokenView = { tokenNumber: number; applicationNumber: string; applicationName: string };
type Board = { counters: BoardCounter[]; missed: TokenView[]; queued: TokenView[] };

export function Wall({ displayKey, initial }: { displayKey: string; initial: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  const { enabled, enable, muted, setMuted, play } = useChime();
  const [blink, setBlink] = useState<Set<string>>(new Set());
  const prev = useRef<Map<string, number | null>>(
    new Map(initial.counters.map((c) => [c.id, c.current?.tokenNumber ?? null])),
  );

  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/board?d=${encodeURIComponent(displayKey)}`, { cache: "no-store" });
      if (!r.ok) return;
      const next: Board = await r.json();
      const newly: string[] = [];
      for (const c of next.counters) {
        const cur = c.current?.tokenNumber ?? null;
        const before = prev.current.get(c.id);
        if (before !== undefined && cur !== null && cur !== before) newly.push(c.id);
        prev.current.set(c.id, cur);
      }
      setBoard(next);
      if (newly.length > 0) {
        play();
        setBlink((s) => new Set([...s, ...newly]));
        setTimeout(
          () => setBlink((s) => new Set([...s].filter((id) => !newly.includes(id)))),
          10_000,
        );
      }
    } catch {
      // keep last-known board; SSE will re-trigger
    }
  }, [displayKey, play]);

  useEventStream(`/api/events?d=${encodeURIComponent(displayKey)}`, refetch);

  return (
    <main className="flex-1 bg-ink-900 text-paper">
      <div className="h-1.5 bg-maroon" />
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-lg bg-maroon font-display text-lg font-bold text-white">
              A
            </span>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Now serving</h1>
          </div>
          {!enabled ? (
            <button onClick={enable} className="rounded-lg bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-800">
              Enable sound
            </button>
          ) : (
            <button
              onClick={() => setMuted(!muted)}
              className="rounded-lg bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-800"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {board.counters.length === 0 && (
            <div className="col-span-full py-10 text-center text-paper/40">No counters are open.</div>
          )}
          {board.counters.map((c) => {
            const active = c.status === "active";
            const isBlink = blink.has(c.id);
            return (
              <div
                key={c.id}
                className={`rounded-2xl border p-5 transition-colors ${
                  isBlink
                    ? "animate-pulse border-saffron bg-saffron/15 motion-reduce:animate-none"
                    : active
                      ? "border-verdant/40 bg-ink-800"
                      : "border-ink-700 bg-ink-800/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-medium text-paper/90">{c.label}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs ${
                      active ? "text-verdant" : c.status === "on_break" ? "text-saffron" : "text-paper/40"
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {c.status === "on_break" ? "break" : c.status}
                  </span>
                </div>
                {c.current ? (
                  <div className="mt-3">
                    <div className="nums font-display text-7xl font-bold leading-none">
                      {c.current.tokenNumber}
                    </div>
                    <div className="mt-2 truncate text-paper/50">{c.current.applicationName}</div>
                  </div>
                ) : (
                  <div className="mt-3 py-6 text-3xl text-ink-700">—</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <TokenPanel title="Missed" items={board.missed} tone="text-saffron" />
          <TokenPanel title="Waiting" items={board.queued} tone="text-paper/80" />
        </div>

        <div aria-live="polite" className="sr-only">
          {board.counters
            .filter((c) => c.current)
            .map((c) => `${c.label} serving token ${c.current!.tokenNumber}`)
            .join(". ")}
        </div>
      </div>
    </main>
  );
}

function TokenPanel({ title, items, tone }: { title: string; items: TokenView[]; tone: string }) {
  return (
    <section className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
      <h2 className="mb-3 font-display text-lg font-medium">
        {title} <span className="text-paper/40">({items.length})</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-paper/30">None</span>}
        {items.map((t) => (
          <span
            key={t.applicationNumber}
            className={`nums rounded-lg bg-ink-900 px-3 py-1.5 font-display text-lg font-semibold ${tone}`}
          >
            {t.tokenNumber}
          </span>
        ))}
      </div>
    </section>
  );
}
