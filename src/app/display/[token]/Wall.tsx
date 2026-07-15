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
  // Keys we've already shown, so a NEW call flashes but a token merely leaving
  // the board (served / not-arrived) doesn't false-trigger a flash + chime.
  const seen = useRef<Set<string>>(new Set(initial.calls.map((c) => callKey(c) as string)));

  // Refetch on each SSE event; if a brand-new call appears top-left, flash it +
  // chime so a registrant sees their number appear top-left.
  const refetch = useCallback(async () => {
    try {
      const r = await fetch(`/api/board?d=${encodeURIComponent(displayKey)}`, { cache: "no-store" });
      if (!r.ok) return;
      const next: Board = await r.json();
      setBoard(next);
      const topKey = callKey(next.calls[0]);
      const isNewTop = !!topKey && !seen.current.has(topKey);
      seen.current = new Set(next.calls.map((c) => callKey(c) as string));
      if (isNewTop) {
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
      className="bg-cover bg-center"
      style={{
        backgroundImage:
          "linear-gradient(rgba(246,245,242,0.9), rgba(246,245,242,0.95)), url(/campus.jpeg)",
      }}
    >
      <div className="flex min-h-screen flex-col p-6 md:p-10">
        <header className="mb-6 flex items-center justify-between border-b-2 border-maroon/70 pb-4">
          <div className="flex items-center gap-4">
            <BrandMark className="h-14 w-auto" />
            <div>
              <h1 className="text-3xl font-bold text-maroon md:text-4xl">Now Serving</h1>
              <p className="text-sm uppercase tracking-wide text-ink/50 md:text-base">
                Document verification · Admissions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-base md:text-lg">
            <span className="hidden text-ink/50 sm:inline">{board.openCounters} counters open</span>
            {!enabled ? (
              <button
                onClick={enable}
                className="rounded-lg border border-ink/15 bg-paper-2 px-4 py-2 hover:bg-ink/5"
              >
                Enable sound
              </button>
            ) : (
              <button
                onClick={() => setMuted(!muted)}
                className="rounded-lg border border-ink/15 bg-paper-2 px-4 py-2 hover:bg-ink/5"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
          </div>
        </header>

        {/* Newest call lands top-left and flashes. Large cards for TV legibility. */}
        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-4 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
          {board.calls.length === 0 && (
            <div className="col-span-full py-20 text-center text-3xl text-ink/40">
              No tokens are being called right now…
            </div>
          )}
          {board.calls.map((c, i) => {
            const isTop = i === 0 && flashTop;
            return (
              <div
                key={`${c.tokenNumber}-${c.counterLabel}`}
                className={`flex flex-col items-center justify-center rounded-3xl border p-6 text-center shadow-sm transition-colors md:p-8 ${
                  isTop
                    ? "animate-pulse border-4 border-maroon bg-maroon-100 motion-reduce:animate-none"
                    : "border-ink/10 bg-paper-2/95"
                }`}
              >
                <div className="nums text-7xl font-bold leading-none text-maroon md:text-8xl">
                  {c.tokenNumber}
                </div>
                <div className="mt-3 text-xl font-semibold text-ink/70 md:text-2xl">
                  {c.counterLabel}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <TokenStrip title="Waiting" items={board.queued} />
          <TokenStrip title="Missed" items={board.missed} tone="text-saffron" />
        </div>

        <footer className="mt-8 border-t border-ink/15 pt-5 text-center text-lg text-ink/70 md:text-xl">
          Built by{" "}
          <a
            href="https://rochit02.github.io"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-maroon hover:underline"
          >
            Rochit Madamanchi
          </a>
          {" & "}
          <a
            href="https://mitran.dev"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-maroon hover:underline"
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
    <section className="rounded-2xl border border-ink/10 bg-paper-2/90 p-5 md:p-6">
      <h2 className="mb-3 text-2xl font-semibold md:text-3xl">
        {title} <span className="text-ink/40">({items.length})</span>
      </h2>
      <div className="flex flex-wrap gap-3">
        {items.length === 0 && <span className="text-xl text-ink/30">None</span>}
        {items.map((t) => (
          <span
            key={t.applicationNumber}
            className={`nums rounded-xl bg-paper px-4 py-2 text-3xl font-bold md:text-4xl ${tone}`}
          >
            {t.tokenNumber}
          </span>
        ))}
      </div>
    </section>
  );
}
