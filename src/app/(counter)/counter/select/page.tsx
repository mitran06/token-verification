import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COUNTER_GATE_COOKIE } from "@/lib/auth/constants";
import { getCsrfToken } from "@/lib/auth/csrf";
import { verifyCounterGate } from "@/lib/auth/gate";
import { getOpenCounters } from "@/lib/auth/login";
import { getAuth } from "@/lib/auth/rbac";
import { StationPicker } from "../StationPicker";

export const dynamic = "force-dynamic";

export default async function SelectStationPage() {
  const auth = await getAuth();
  if (auth?.kind === "counter") redirect("/counter/console");
  const gate = (await cookies()).get(COUNTER_GATE_COOKIE)?.value;
  if (!verifyCounterGate(gate)) redirect("/counter");

  const [counters, csrf] = await Promise.all([getOpenCounters(), getCsrfToken()]);
  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Pick your counter</h1>
      <StationPicker counters={counters} csrf={csrf} />
    </main>
  );
}
