"use server";
import { revalidatePath } from "next/cache";
import { verifyCsrf } from "@/lib/auth/csrf";
import { AuthError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/rbac";
import { deleteToken, generateToken, prioritizeToken } from "@/lib/queue/queue";

export type ReceptionState = { error?: string; ok?: string };

async function guard(formData: FormData) {
  const auth = await requireUser("reception");
  await verifyCsrf(formData.get("csrf"));
  return auth;
}

export async function generateTokenAction(
  _prev: ReceptionState,
  formData: FormData,
): Promise<ReceptionState> {
  try {
    const auth = await guard(formData);
    const applicationNumber = String(formData.get("applicationNumber") ?? "").trim();
    if (!applicationNumber) return { error: "Choose an applicant first." };
    const r = await generateToken(applicationNumber, auth.user.id);
    if (!r.ok) {
      return {
        error:
          r.reason === "duplicate"
            ? "That applicant already has a live token."
            : "That application number isn't in the roster.",
      };
    }
    revalidatePath("/reception");
    return { ok: `Token ${r.token.tokenNumber} · ${r.token.applicationName}` };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function prioritizeTokenAction(
  _prev: ReceptionState,
  formData: FormData,
): Promise<ReceptionState> {
  try {
    const auth = await guard(formData);
    const r = await prioritizeToken(String(formData.get("tokenId") ?? ""), auth.user.id);
    if (!r.ok) return { error: "Couldn't re-queue that token." };
    revalidatePath("/reception");
    return { ok: "Re-queued to the front." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function deleteTokenAction(
  _prev: ReceptionState,
  formData: FormData,
): Promise<ReceptionState> {
  try {
    const auth = await guard(formData);
    const r = await deleteToken(String(formData.get("tokenId") ?? ""), auth.user.id);
    if (!r.ok) return { error: "Couldn't delete that token." };
    revalidatePath("/reception");
    return { ok: "Token deleted." };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
