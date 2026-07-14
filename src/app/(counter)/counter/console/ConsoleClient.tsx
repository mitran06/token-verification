"use client";
import { useActionState } from "react";
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
}: {
  action: Action;
  csrf: string;
  label: string;
  className: string;
  disabled?: boolean;
  hidden?: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ConsoleState, FormData>(action, {});
  return (
    <div className="flex flex-col gap-1">
      <form action={formAction}>
        <input type="hidden" name="csrf" value={csrf} />
        {hidden}
        <button
          type="submit"
          disabled={disabled}
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
}: {
  csrf: string;
  status: Status;
  current: Current;
}) {
  const active = status === "active";
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-8">
      <div className="w-full rounded-2xl border border-ink/10 bg-paper-2 p-8 text-center shadow-sm">
        {current ? (
          <>
            <div className="text-sm uppercase tracking-wide text-ink/40">Now serving</div>
            <div className="nums my-2 font-display text-7xl font-bold text-maroon">{current.tokenNumber}</div>
            <div className="text-ink/80">{current.applicationName}</div>
            <div className="text-sm text-ink/40">{current.applicationNumber}</div>
          </>
        ) : (
          <div className="py-8 text-lg text-ink/30">No token in hand</div>
        )}
      </div>

      <div className="flex w-full gap-3">
        <ActionButton
          action={nextTokenAction}
          csrf={csrf}
          label="Next Token"
          disabled={!active}
          className="flex-1 rounded-xl bg-verdant px-4 py-4 text-lg font-semibold text-white hover:bg-verdant/90"
        />
        <ActionButton
          action={notArrivedAction}
          csrf={csrf}
          label="Not Arrived"
          disabled={!active || !current}
          className="flex-1 rounded-xl bg-saffron px-4 py-4 text-lg font-semibold text-white hover:bg-saffron/90"
        />
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
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                status === s ? "border-maroon bg-maroon text-white" : "border-ink/15 hover:bg-ink/5"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
