import { redirect } from "next/navigation";
import { getCsrfToken } from "@/lib/auth/csrf";
import { getAuth } from "@/lib/auth/rbac";
import { CounterPasswordForm } from "./CounterPasswordForm";

export default async function CounterGatePage() {
  const auth = await getAuth();
  if (auth?.kind === "counter") redirect("/counter/console");
  const csrf = await getCsrfToken();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Counter station</h1>
      <p className="text-sm text-zinc-500">Enter the shared counter password to pick your station.</p>
      <CounterPasswordForm csrf={csrf} />
    </main>
  );
}
