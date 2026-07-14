import "server-only";
import { type AuthContext, type CounterAuth, type UserAuth, validateSessionToken } from "./session";
import { getSessionToken } from "./session-cookie";
import { AuthError } from "./errors";

export async function getAuth(): Promise<AuthContext | null> {
  const token = await getSessionToken();
  if (!token) return null;
  return validateSessionToken(token);
}

// Require a staff (admin/reception) session, optionally of a specific role.
export async function requireUser(role?: "admin" | "reception"): Promise<UserAuth> {
  const auth = await getAuth();
  if (!auth || auth.kind !== "user") throw new AuthError("Sign in required.", 401);
  if (role && auth.user.role !== role) throw new AuthError("You don't have access to that.", 403);
  return auth;
}

// Require a bound counter session.
export async function requireCounter(): Promise<CounterAuth> {
  const auth = await getAuth();
  if (!auth || auth.kind !== "counter") throw new AuthError("Pick a counter first.", 401);
  return auth;
}
