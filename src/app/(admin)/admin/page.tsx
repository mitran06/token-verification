import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { db } from "@/db";
import { applications, counters, users } from "@/db/schema";
import { getCsrfToken } from "@/lib/auth/csrf";
import { getAuth } from "@/lib/auth/rbac";
import {
  CONFIG_KEYS,
  getActionDelaySeconds,
  getChimeEnabled,
  getConfig,
  getNowServingScale,
} from "@/lib/config";
import { getOrCreateDisplayKey } from "@/lib/display-link";
import { getTodayTokens } from "@/lib/queue/queue";
import { PageHeader } from "@/components/PageHeader";
import { AdminDashboard } from "./AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await getAuth();
  if (auth?.kind !== "user" || auth.user.role !== "admin") redirect("/login");

  const [
    counterList,
    receptionUsers,
    pwHash,
    displayKey,
    appCountRows,
    todayTokens,
    actionDelaySeconds,
    chimeEnabled,
    nowServingScale,
    csrf,
  ] = await Promise.all([
    db
      .select({ id: counters.id, label: counters.label, isOpen: counters.isOpen, status: counters.status })
      .from(counters)
      .orderBy(counters.sortOrder, counters.label),
    db
      .select({ id: users.id, username: users.username, isActive: users.isActive })
      .from(users)
      .where(eq(users.role, "reception"))
      .orderBy(users.username),
    getConfig<string>(CONFIG_KEYS.counterPasswordHash),
    getOrCreateDisplayKey(),
    db.select({ n: sql<number>`count(*)::int` }).from(applications),
    getTodayTokens(),
    getActionDelaySeconds(),
    getChimeEnabled(),
    getNowServingScale(),
    getCsrfToken(),
  ]);
  const applicationCount = appCountRows[0]?.n ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <PageHeader
        title={`Admin · ${auth.user.username}`}
        right={
          <form action={logoutAction}>
            <input type="hidden" name="csrf" value={csrf} />
            <button type="submit" className="text-sm text-ink/50 underline">
              Log out
            </button>
          </form>
        }
      />
      <AdminDashboard
        csrf={csrf}
        counterPasswordSet={Boolean(pwHash)}
        counters={counterList}
        receptionUsers={receptionUsers}
        displayPath={`/display/${displayKey}`}
        applicationCount={applicationCount}
        todayTokens={todayTokens}
        actionDelaySeconds={actionDelaySeconds}
        chimeEnabled={chimeEnabled}
        nowServingScale={nowServingScale}
      />
    </main>
  );
}
