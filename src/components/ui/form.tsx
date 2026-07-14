"use client";
import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        className ??
        "rounded-lg bg-maroon px-4 py-2.5 font-medium text-white transition-colors hover:bg-maroon-600 disabled:opacity-50"
      }
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-red-600">
      {message}
    </p>
  );
}

export function FormOk({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="text-sm text-green-700">
      {message}
    </p>
  );
}
