import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { db } from "@/db";
import { applications } from "@/db/schema";
import { getCsrfToken } from "@/lib/auth/csrf";
import { getAuth } from "@/lib/auth/rbac";
import { getNotArrivedTokens, getQueuedTokens } from "@/lib/queue/queue";
import { LiveRefresh } from "@/components/LiveRefresh";
import { PageHeader } from "@/components/PageHeader";
import { ReceptionClient } from "./ReceptionClient";

export const dynamic = "force-dynamic";

export default async function ReceptionPage() {
  const auth = await getAuth();
  if (auth?.kind !== "user" || auth.user.role !== "reception") redirect("/login");

  const [applicants, queued, missed, csrf] = await Promise.all([
    db
      .select({ number: applications.applicationNumber, name: applications.applicationName })
      .from(applications)
      .orderBy(asc(applications.applicationNumber)),
    getQueuedTokens(),
    getNotArrivedTokens(),
    getCsrfToken(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <PageHeader
        title={`Reception · ${auth.user.username}`}
        right={
          <form action={logoutAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="text-sm text-ink/50 underline">
              Log out
            </button>
          </form>
        }
      />
      <ReceptionClient csrf={csrf} applicants={applicants} queued={queued} missed={missed} />
      <LiveRefresh />
    </main>
  );
}
