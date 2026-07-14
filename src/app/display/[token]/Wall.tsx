"use client";
import { useCallback, useRef, useState } from "react";
import { BrandMark } from "@/components/PageHeader";
import { useChime } from "@/components/useChime";
import { useEventStream } from "@/components/useEventStream";

type Call = { tokenNumber: number; counterLabel: string };
type TokenView = { tokenNumber: number; applicationNumber: string; applicationName: string };
type Board = { calls: Call[]; queued: TokenView[]; missed: TokenView[]; openCounters: number };

const callKey = (c: Call | undefined) => (c ? `${c.tokenNumber}@${c.counterLabel}` : null);

export function Wall({ displayKey, initial }: { displayKey: string; initial: Board }) {
  const [board, setBoard] = useState<Board>(initial);
  const { enabled, enable, muted, setMuted, play } = useChime();
  const [flashTop, setFlashTop] = useState(false);
  const lastTop = useRef<string | null>(callKey(initial.calls[0]));

  // Refetch on each SSE event; if the newest call changed, flash the top-left
  // cell + chime so a registrant sees their number appear top-left.
  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/board?d=${encodeURIComponent(displayKey)}`, { cache: "no-store" });
      if (!r.ok) return;
      const next: Board = await r.json();
      const topKey = callKey(next.calls[0]);
      setBoard(next);
      if (topKey && topKey !== lastTop.current) {
        lastTop.current = topKey;
        play();
        setFlashTop(true);
        setTimeout(() => setFlashTop(false), 10_000);
      }
    } catch {
      // keep last-known board; SSE will re-trigger
    }
  }, [displayKey, play]);

  useEventStream(`/api/events?d=${encodeURIComponent(displayKey)}`, refetch);

  return (
    <main
      className="flex-1 bg-cover bg-center bg-fixed"
      style={{
        backgroundImage:
          "linear-gradient(rgba(246,245,242,0.88), rgba(246,245,242,0.94)), url(/campus.jpeg)",
      }}
    >
      <div className="flex min-h-full flex-col p-6">
        <header className="mb-5 flex items-center justify-between border-b-2 border-maroon/70 pb-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-auto" />
            <div>
              <h1 className="text-2xl font-bold text-maroon">Now Serving</h1>
              <p className="text-xs uppercase tracking-wide text-ink/50">
                Document verification · Admissions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink/50 sm:inline">{board.openCounters} counters open</span>
            {!enabled ? (
              <button
                onClick={enable}
                className="rounded-md border border-ink/15 bg-paper-2 px-3 py-1.5 hover:bg-ink/5"
              >
                Enable sound
              </button>
            ) : (
              <button
                onClick={() => setMuted(!muted)}
                className="rounded-md border border-ink/15 bg-paper-2 px-3 py-1.5 hover:bg-ink/5"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
          </div>
        </header>

        {/* Newest call lands top-left and flashes. */}
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {board.calls.length === 0 && (
            <div className="col-span-full py-16 text-center text-lg text-ink/40">
              Waiting for the first token to be called…
            </div>
          )}
          {board.calls.map((c, i) => {
            const isTop = i === 0 && flashTop;
            return (
              <div
                key={`${c.tokenNumber}-${c.counterLabel}`}
                className={`rounded-xl border p-4 text-center shadow-sm transition-colors ${
                  isTop
                    ? "animate-pulse border-maroon bg-maroon-100 motion-reduce:animate-none"
                    : "border-ink/10 bg-paper-2"
                }`}
              >
                <div className="nums text-5xl font-bold text-maroon">{c.tokenNumber}</div>
                <div className="mt-1 text-sm font-medium text-ink/70">{c.counterLabel}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <TokenStrip title="Waiting" items={board.queued} />
          <TokenStrip title="Missed" items={board.missed} tone="text-saffron" />
        </div>

        <footer className="mt-6 border-t border-ink/10 pt-3 text-center text-xs text-ink/50">
          Built by{" "}
          <a
            href="https://mitran.dev"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-maroon hover:underline"
          >
            Rochit Madamanchi
          </a>
          {" & "}
          <a
            href="https://mitran.dev"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-maroon hover:underline"
          >
            Mitran Gokulnath
          </a>
        </footer>

        <div aria-live="polite" className="sr-only">
          {board.calls[0]
            ? `Token ${board.calls[0].tokenNumber} at ${board.calls[0].counterLabel}`
            : ""}
        </div>
      </div>
    </main>
  );
}

function TokenStrip({
  title,
  items,
  tone = "text-ink/80",
}: {
  title: string;
  items: TokenView[];
  tone?: string;
}) {
  return (
    <section className="rounded-xl border border-ink/10 bg-paper-2/90 p-4">
      <h2 className="mb-2 font-semibold">
        {title} <span className="text-ink/40">({items.length})</span>
      </h2>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-ink/30">None</span>}
        {items.map((t) => (
          <span
            key={t.applicationNumber}
            className={`nums rounded-md bg-paper px-2.5 py-1 font-semibold ${tone}`}
          >
            {t.tokenNumber}
          </span>
        ))}
      </div>
    </section>
  );
}
