"use server";
import { redirect } from "next/navigation";
import { verifyCsrf } from "@/lib/auth/csrf";
import { AuthError } from "@/lib/auth/errors";
import { authenticateUser } from "@/lib/auth/login";
import { lockRemainingMs, recordFailure, recordSuccess } from "@/lib/auth/ratelimit";
import { createUserSession, hashSessionToken, invalidateSession } from "@/lib/auth/session";
import {
  clearSessionCookie,
  getSessionToken,
  setSessionCookie,
} from "@/lib/auth/session-cookie";
import { getClientIp } from "@/lib/request";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  let redirectTo: string;
  try {
    await verifyCsrf(formData.get("csrf"));
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const ip = await getClientIp();
    const key = `login:${username.trim().toLowerCase()}:${ip}`;
    const locked = lockRemainingMs(key);
    if (locked > 0) {
      return { error: `Too many attempts. Try again in ${Math.ceil(locked / 60000)} min.` };
    }

    const user = await authenticateUser(username, password);
    if (!user) {
      recordFailure(key);
      return { error: "Wrong username or password." };
    }
    recordSuccess(key);

    // Session regeneration: drop any pre-auth session before issuing a new one.
    const existing = await getSessionToken();
    if (existing) await invalidateSession(hashSessionToken(existing));

    const { token, expiresAt } = await createUserSession(user.id);
    await setSessionCookie(token, expiresAt);
    redirectTo = user.role === "admin" ? "/admin" : "/reception";
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
  redirect(redirectTo);
}

export async function logoutAction(formData: FormData): Promise<void> {
  await verifyCsrf(formData.get("csrf"));
  const token = await getSessionToken();
  if (token) await invalidateSession(hashSessionToken(token));
  await clearSessionCookie();
  redirect("/login");
}
