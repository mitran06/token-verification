import "server-only";
import { cookies } from "next/headers";
import { CSRF_COOKIE } from "./constants";
import { AuthError } from "./errors";

// Double-submit CSRF. The cookie is set by middleware (HttpOnly); the server
// reads it and renders it into a hidden form field; mutating actions compare the
// submitted value to the cookie. SameSite=Lax already blocks cross-site POSTs;
// this is defense-in-depth and closes the legacy GET-mutation / forgery holes.
export { CSRF_COOKIE } from "./constants";
export { generateCsrfToken } from "./constants";

// For server components to inject into forms. "" if middleware hasn't set it yet
// (the action then rejects; the next load will have it).
export async function getCsrfToken(): Promise<string> {
  return (await cookies()).get(CSRF_COOKIE)?.value ?? "";
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function verifyCsrf(
  provided: FormDataEntryValue | string | null | undefined,
): Promise<void> {
  const cookieToken = (await cookies()).get(CSRF_COOKIE)?.value;
  const submitted = typeof provided === "string" ? provided : "";
  if (!cookieToken || !submitted || !timingSafeEqual(cookieToken, submitted)) {
    throw new AuthError("Your session expired — please try again.", 403);
  }
}
