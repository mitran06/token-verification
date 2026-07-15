"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { counters, users } from "@/db/schema";
import { verifyCsrf } from "@/lib/auth/csrf";
import { AuthError } from "@/lib/auth/errors";
import { assertNonEmptyPassword, hashPassword } from "@/lib/auth/password";
import { requireUser } from "@/lib/auth/rbac";
import { invalidateCounterSessions, invalidateUserSessions } from "@/lib/auth/session";
import { CONFIG_KEYS, setConfig } from "@/lib/config";
import { rotateDisplayKey } from "@/lib/display-link";
import { reopenToken } from "@/lib/queue/queue";

export type AdminState = { error?: string; ok?: string };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

async function guard(formData: FormData): Promise<void> {
  await requireUser("admin");
  await verifyCsrf(formData.get("csrf"));
}

export async function setCounterPasswordAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const pwd = assertNonEmptyPassword(String(formData.get("password") ?? ""));
    if (pwd.length > 200) return { error: "Password is too long." };
    await setConfig(CONFIG_KEYS.counterPasswordHash, await hashPassword(pwd));
    revalidatePath("/admin");
    return { ok: "Shared counter password updated." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function setActionDelayAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const n = Number(formData.get("seconds"));
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      return { error: "Enter a whole number of seconds from 0 to 120." };
    }
    await setConfig(CONFIG_KEYS.actionDelaySeconds, n);
    revalidatePath("/admin");
    return { ok: `Counter action delay set to ${n}s.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function addCounterAction(_prev: AdminState, formData: FormData): Promise<AdminState> {
  try {
    await guard(formData);
    const label = String(formData.get("label") ?? "").trim();
    if (!label) return { error: "Counter name is required." };
    if (label.length > 30) return { error: "Counter name must be 30 characters or fewer." };
    const [{ max }] = await db
      .select({ max: sql<number>`coalesce(max(${counters.sortOrder}), 0)` })
      .from(counters);
    await db.insert(counters).values({ label, sortOrder: Number(max) + 1, isOpen: true });
    revalidatePath("/admin");
    return { ok: `Added ${label}.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    if (isUniqueViolation(e)) return { error: "A counter with that name already exists." };
    throw e;
  }
}

export async function seedCountersAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const n = Number(formData.get("count") ?? 0);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      return { error: "Enter a whole number from 1 to 50." };
    }
    await db.transaction(async (tx) => {
      await tx.update(counters).set({ isOpen: false, updatedAt: new Date() });
      for (let i = 1; i <= n; i++) {
        const label = `Counter ${i}`;
        const [ex] = await tx
          .select({ id: counters.id })
          .from(counters)
          .where(eq(sql`lower(${counters.label})`, label.toLowerCase()))
          .limit(1);
        if (ex) {
          await tx
            .update(counters)
            .set({ isOpen: true, sortOrder: i, updatedAt: new Date() })
            .where(eq(counters.id, ex.id));
        } else {
          await tx.insert(counters).values({ label, sortOrder: i, isOpen: true });
        }
      }
    });
    revalidatePath("/admin");
    return { ok: `Opened ${n} counter${n === 1 ? "" : "s"}.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function toggleCounterOpenAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const id = String(formData.get("counterId") ?? "");
    const open = formData.get("open") === "1";
    if (open) {
      await db
        .update(counters)
        .set({ isOpen: true, updatedAt: new Date() })
        .where(eq(counters.id, id));
    } else {
      await db
        .update(counters)
        .set({ isOpen: false, status: "closed", updatedAt: new Date() })
        .where(eq(counters.id, id));
      await invalidateCounterSessions(id); // closing frees any handler
    }
    revalidatePath("/admin");
    return { ok: open ? "Counter opened." : "Counter closed." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function createReceptionUserAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const username = String(formData.get("username") ?? "").trim();
    if (!username) return { error: "Username is required." };
    if (username.length > 50) return { error: "Username must be 50 characters or fewer." };
    const password = assertNonEmptyPassword(String(formData.get("password") ?? ""));
    if (password.length > 200) return { error: "Password is too long." };
    const passwordHash = await hashPassword(password);
    await db.insert(users).values({ username, role: "reception", passwordHash });
    revalidatePath("/admin");
    return { ok: `Created reception user '${username}'.` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    if (isUniqueViolation(e)) return { error: "That username is taken." };
    throw e;
  }
}

export async function rotateDisplayKeyAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    await rotateDisplayKey();
    revalidatePath("/admin");
    return { ok: "Display link rotated — the old link no longer works." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function setUserActiveAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const id = String(formData.get("userId") ?? "");
    const active = formData.get("active") === "1";
    if (!active) {
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, id)).limit(1);
      if (!target) return { error: "User not found." };
      if (target.role === "admin") {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
        if (Number(count) <= 1) return { error: "You can't disable the last active admin." };
      }
    }
    await db.update(users).set({ isActive: active, updatedAt: new Date() }).where(eq(users.id, id));
    if (!active) await invalidateUserSessions(id);
    revalidatePath("/admin");
    return { ok: active ? "User enabled." : "User disabled." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function reopenTokenAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  try {
    await guard(formData);
    const r = await reopenToken(String(formData.get("tokenId") ?? ""));
    if (!r.ok) {
      return {
        error:
          r.reason === "duplicate_live"
            ? "That applicant already has a live token."
            : "Couldn't reopen that token.",
      };
    }
    revalidatePath("/admin");
    return { ok: "Token reopened." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
