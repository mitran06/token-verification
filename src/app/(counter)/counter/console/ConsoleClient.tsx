"use client";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { FormError } from "@/components/ui/form";
import {
  type ConsoleState,
  nextTokenAction,
  notArrivedAction,
  setStatusAction,
} from "../actions";

type Status = "active" | "on_break" | "closed";
type Current = { tokenNumber: number; applicationNumber: string; applicationName: string } | null;
type Action = (prev: ConsoleState, formData: FormData) => Promise<ConsoleState>;

function ActionButton({
  action,
  csrf,
  label,
  className,
  disabled,
  hidden,
  onCompleted,
}: {
  action: Action;
  csrf: string;
  label: string;
  className: string;
  disabled?: boolean;
  hidden?: React.ReactNode;
  onCompleted?: () => void;
}) {
  const [state, formAction, isPending] = useActionState<ConsoleState, FormData>(action, {});
  // Start the cool-down only AFTER the action finishes (pending → done), so the
  // form actually submits first. Disabling the button during the click would
  // cancel the submit — that was the "no token assigned when a delay is set" bug.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending) onCompleted?.();
    wasPending.current = isPending;
  }, [isPending, onCompleted]);
  return (
    <div className="flex flex-1 flex-col gap-1">
      <form action={formAction} className="w-full">
        <input type="hidden" name="csrf" value={csrf} />
        {hidden}
        <button
          type="submit"
          disabled={disabled || isPending}
          className={`${className} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {label}
        </button>
      </form>
      <FormError message={state.error} />
    </div>
  );
}

export function ConsoleClient({
  csrf,
  status,
  current,
  delaySeconds,
}: {
  csrf: string;
  status: Status;
  current: Current;
  delaySeconds: number;
}) {
  const active = status === "active";

  // After Next Token / Not Arrived completes, lock BOTH buttons for
  // `delaySeconds` so an accidental double-click can't skip a token.
  const [remaining, setRemaining] = useState(0);
  const cooling = remaining > 0;
  const startCooldown = useCallback(() => {
    if (delaySeconds > 0) setRemaining(delaySeconds);
  }, [delaySeconds]);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8">
      <div className="w-full rounded-2xl border border-ink/10 bg-paper-2 p-8 text-center shadow-sm">
        {current ? (
          <>
            <div className="text-sm uppercase tracking-wide text-ink/40">Now serving</div>
            <div className="nums my-2 font-display text-7xl font-bold text-maroon">{current.tokenNumber}</div>
            <div className="mt-3 text-ink/80">
              <span className="text-ink/50">Name: </span>
              <span className="font-medium">{current.applicationName}</span>
            </div>
            <div className="mt-0.5 text-lg text-ink/80">
              <span className="text-ink/50">Application No.: </span>
              <span className="nums font-semibold">{current.applicationNumber}</span>
            </div>
          </>
        ) : (
          <div className="py-8 text-lg text-ink/30">No token in hand</div>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full gap-3">
          <ActionButton
            action={nextTokenAction}
            csrf={csrf}
            label="Next Token"
            disabled={!active || cooling}
            onCompleted={startCooldown}
            className="w-full rounded-xl bg-verdant px-4 py-4 text-lg font-semibold text-white hover:bg-verdant/90"
          />
          <ActionButton
            action={notArrivedAction}
            csrf={csrf}
            label="Not Arrived"
            disabled={!active || !current || cooling}
            onCompleted={startCooldown}
            className="w-full rounded-xl bg-saffron px-4 py-4 text-lg font-semibold text-white hover:bg-saffron/90"
          />
        </div>
        {cooling && (
          <p aria-live="polite" className="text-center text-sm text-ink/50">
            Please wait {remaining}s before serving the next token.
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="text-sm text-zinc-500">
          Status: <span className="font-medium">{status.replace("_", " ")}</span>
        </div>
        <div className="flex gap-2">
          {(["active", "on_break", "closed"] as const).map((s) => (
            <ActionButton
              key={s}
              action={setStatusAction}
              csrf={csrf}
              label={s === "active" ? "Active" : s === "on_break" ? "On Break" : "Closed"}
              hidden={<input type="hidden" name="status" value={s} />}
              className={`w-full rounded-lg border px-3 py-2 text-sm font-medium ${
                status === s ? "border-maroon bg-maroon text-white" : "border-ink/15 hover:bg-ink/5"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
