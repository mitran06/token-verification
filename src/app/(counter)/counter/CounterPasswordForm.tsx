"use client";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { type CounterPwState, counterPasswordAction } from "./actions";

export function CounterPasswordForm({ csrf }: { csrf: string }) {
  const [state, action] = useActionState<CounterPwState, FormData>(counterPasswordAction, {});
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input
        name="password"
        type="password"
        placeholder="Counter password"
        autoComplete="off"
        required
        className="rounded-md border border-zinc-300 px-3 py-2"
      />
      <FormError message={state.error} />
      <SubmitButton>Continue</SubmitButton>
    </form>
  );
}
