"use client";
import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import { type LoginState, loginAction } from "./actions";

export function LoginForm({ csrf }: { csrf: string }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input
        name="username"
        placeholder="Username"
        autoComplete="username"
        required
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 outline-none focus:border-maroon"
      />
      <input
        name="password"
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        required
        className="rounded-lg border border-ink/15 bg-paper px-3 py-2.5 outline-none focus:border-maroon"
      />
      <FormError message={state.error} />
      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
