"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COUNTER_GATE_COOKIE } from "@/lib/auth/constants";
import { verifyCsrf } from "@/lib/auth/csrf";
import { AuthError } from "@/lib/auth/errors";
import { signCounterGate, verifyCounterGate } from "@/lib/auth/gate";
import { bindCounterStation, releaseCounter } from "@/lib/auth/login";
import { verifyPassword } from "@/lib/auth/password";
import { counterPwGlobal, lockRemainingMs, recordFailure, recordSuccess } from "@/lib/auth/ratelimit";
import { getAuth, requireCounter } from "@/lib/auth/rbac";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session-cookie";
import { CONFIG_KEYS, getConfig } from "@/lib/config";
import { nextToken, notArrived, setCounterStatus } from "@/lib/queue/queue";
import { getClientIp } from "@/lib/request";
import { revalidatePath } from "next/cache";

export type CounterPwState = { error?: string };
export type SelectState = { error?: string; needsTakeover?: string };

// Step 1: shared counter password → sets a short-lived signed gate cookie.
export async function counterPasswordAction(
  _prev: CounterPwState,
  formData: FormData,
): Promise<CounterPwState> {
  try {
    await verifyCsrf(formData.get("csrf"));
    const password = String(formData.get("password") ?? "");
    if (password.length > 200) return { error: "Wrong password." };
    const ip = await getClientIp();
    const key = `counter-pw:${ip}`;
    const gkey = "counter-pw:global";
    // Per-IP limit (real IP via CF-Connecting-IP) + a global backstop so a
    // botnet can't parallelize around the per-IP limit against a simple password.
    const locked = Math.max(lockRemainingMs(key), counterPwGlobal.lockRemainingMs(gkey));
    if (locked > 0) {
      return { error: `Too many attempts. Try again in ${Math.ceil(locked / 60000)} min.` };
    }
    const hash = await getConfig<string>(CONFIG_KEYS.counterPasswordHash);
    if (!hash) return { error: "No counter password is set yet. Ask an admin." };
    if (!(await verifyPassword(hash, password))) {
      recordFailure(key);
      counterPwGlobal.recordFailure(gkey);
      return { error: "Wrong password." };
    }
    recordSuccess(key);
    counterPwGlobal.recordSuccess(gkey);
    (await cookies()).set(COUNTER_GATE_COOKIE, signCounterGate(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/counter/select");
}

// Step 2: bind a station (with take-over). Requires a valid gate.
export async function selectCounterAction(
  _prev: SelectState,
  formData: FormData,
): Promise<SelectState> {
  try {
    await verifyCsrf(formData.get("csrf"));
    const gate = (await cookies()).get(COUNTER_GATE_COOKIE)?.value;
    if (!verifyCounterGate(gate)) redirect("/counter");

    const counterId = String(formData.get("counterId") ?? "");
    const force = formData.get("force") === "1";
    if (!counterId) return { error: "Pick a counter." };

    const r = await bindCounterStation(counterId, force);
    if (!r.ok) {
      if (r.reason === "in_use") {
        return { needsTakeover: counterId, error: "That counter is in use." };
      }
      return { error: r.reason === "not_open" ? "That counter isn't open." : "Counter not found." };
    }
    (await cookies()).delete(COUNTER_GATE_COOKIE);
    await setSessionCookie(r.token, r.expiresAt);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect("/counter/console");
}

export async function counterLogoutAction(formData: FormData): Promise<void> {
  await verifyCsrf(formData.get("csrf"));
  const auth = await getAuth();
  if (auth?.kind === "counter") await releaseCounter(auth.counter.id, auth.sessionId);
  await clearSessionCookie();
  redirect("/counter");
}

// --- console (queue) actions ---
export type ConsoleState = { error?: string };

export async function nextTokenAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  try {
    const auth = await requireCounter();
    await verifyCsrf(formData.get("csrf"));
    const r = await nextToken(auth.counter.id);
    if (!r.ok) return { error: "Set your counter to Active to serve tokens." };
    revalidatePath("/counter/console");
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function notArrivedAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  try {
    const auth = await requireCounter();
    await verifyCsrf(formData.get("csrf"));
    const r = await notArrived(auth.counter.id);
    if (!r.ok) return { error: "Set your counter to Active to serve tokens." };
    revalidatePath("/counter/console");
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function setStatusAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  try {
    const auth = await requireCounter();
    await verifyCsrf(formData.get("csrf"));
    const status = String(formData.get("status") ?? "");
    if (status !== "active" && status !== "on_break" && status !== "closed") {
      return { error: "Invalid status." };
    }
    await setCounterStatus(auth.counter.id, status);
    revalidatePath("/counter/console");
    return {};
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
