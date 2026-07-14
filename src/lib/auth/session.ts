import "server-only";
import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { counters, sessions, users } from "@/db/schema";

// Pure session logic (DB + crypto only, no framework glue). Cookie helpers that
// need next/headers live in ./session-cookie so this stays node-testable.
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ~12h (sliding)
const RENEW_WITHIN_MS = SESSION_TTL_MS / 2;

export type UserAuth = {
  kind: "user";
  sessionId: string;
  user: { id: string; username: string; role: "admin" | "reception" };
};
export type CounterAuth = {
  kind: "counter";
  sessionId: string;
  counter: { id: string; label: string; status: "active" | "on_break" | "closed"; isOpen: boolean };
};
export type AuthContext = UserAuth | CounterAuth;

// Opaque token (Oslo pattern): the cookie holds the raw token; the DB stores
// only its SHA-256, so a DB leak can't be replayed as a live session.
export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function hashSessionToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

async function createSession(
  kind: "user" | "counter",
  ref: { userId?: string; counterId?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const id = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, kind, expiresAt, ...ref });
  return { token, expiresAt };
}

export function createUserSession(userId: string) {
  return createSession("user", { userId });
}
export function createCounterSession(counterId: string) {
  return createSession("counter", { counterId });
}

export async function validateSessionToken(token: string): Promise<AuthContext | null> {
  const id = hashSessionToken(token);
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!s) return null;

  if (Date.now() >= s.expiresAt.getTime()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  // Sliding expiry: extend when past the halfway mark.
  if (Date.now() >= s.expiresAt.getTime() - RENEW_WITHIN_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }

  if (s.kind === "user" && s.userId) {
    const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u || !u.isActive) {
      await db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    return { kind: "user", sessionId: id, user: { id: u.id, username: u.username, role: u.role } };
  }
  if (s.kind === "counter" && s.counterId) {
    const [c] = await db.select().from(counters).where(eq(counters.id, s.counterId)).limit(1);
    if (!c) {
      await db.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    return {
      kind: "counter",
      sessionId: id,
      counter: { id: c.id, label: c.label, status: c.status, isOpen: c.isOpen },
    };
  }
  return null;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
export async function invalidateCounterSessions(counterId: string): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.kind, "counter"), eq(sessions.counterId, counterId)));
}
