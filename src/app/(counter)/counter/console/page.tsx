import { redirect } from "next/navigation";
import { getCsrfToken } from "@/lib/auth/csrf";
import { getAuth } from "@/lib/auth/rbac";
import { getCounterCurrent } from "@/lib/queue/queue";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageHeader } from "@/components/PageHeader";
import { counterLogoutAction } from "../actions";
import { ConsoleClient } from "./ConsoleClient";

export const dynamic = "force-dynamic";

export default async function CounterConsolePage() {
  const auth = await getAuth();
  if (auth?.kind !== "counter") redirect("/counter");
  const [current, csrf] = await Promise.all([getCounterCurrent(auth.counter.id), getCsrfToken()]);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-8 p-8">
      <div className="w-full">
        <PageHeader
          title={auth.counter.label}
          right={
            <form action={counterLogoutAction}>
              <input type="hidden" name="csrf" value={csrf} />
              <button type="submit" className="text-sm text-ink/50 underline">
                Log out
              </button>
            </form>
          }
        />
      </div>
      <ConsoleClient csrf={csrf} status={auth.counter.status} current={current} />
      <LiveRefresh />
    </main>
  );
}
