"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { type OpenCounter } from "@/lib/auth/login";
import { type SelectState, selectCounterAction } from "./actions";

export function StationPicker({ counters, csrf }: { counters: OpenCounter[]; csrf: string }) {
  const [state, action] = useActionState<SelectState, FormData>(selectCounterAction, {});
  if (counters.length === 0) {
    return <p className="text-sm text-zinc-500">No counters are open. Ask an admin to open one.</p>;
  }
  return (
    <ul className="flex w-full max-w-md flex-col gap-2">
      {counters.map((c) => {
        const takingOver = state.needsTakeover === c.id;
        return (
          <li key={c.id}>
            <form
              action={action}
              className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-3"
            >
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="counterId" value={c.id} />
              <span className="flex items-center gap-2 font-medium">
                {c.label}
                {c.inUse && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">in use</span>
                )}
              </span>
              {takingOver ? (
                <>
                  <input type="hidden" name="force" value="1" />
                  <SubmitButton className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500">
                    Take over
                  </SubmitButton>
                </>
              ) : (
                <SubmitButton className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
                  Select
                </SubmitButton>
              )}
            </form>
          </li>
        );
      })}
    </ul>
  );
}
