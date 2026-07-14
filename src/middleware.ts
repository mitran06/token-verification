import { type NextRequest, NextResponse } from "next/server";
import {
  COUNTER_GATE_COOKIE,
  CSRF_COOKIE,
  SESSION_COOKIE,
  generateCsrfToken,
} from "@/lib/auth/constants";

// Edge middleware: (1) ensure a CSRF cookie exists AND is readable by this same
// request's server components (so forms get the token on first render), (2)
// coarse-gate protected route groups by cookie presence. Fine-grained kind/role
// checks (which need the DB) happen in Node server components / actions.
const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export function middleware(req: NextRequest): NextResponse {
  let csrf = req.cookies.get(CSRF_COOKIE)?.value;
  const isNew = !csrf;
  if (!csrf) {
    csrf = generateCsrfToken();
    // Reflect into the request so getCsrfToken() (request cookies) sees it now.
    req.cookies.set(CSRF_COOKIE, csrf);
  }

  const withCsrf = (res: NextResponse): NextResponse => {
    if (isNew) res.cookies.set(CSRF_COOKIE, csrf, cookieOpts);
    return res;
  };
  const redirectTo = (to: string): NextResponse => {
    const url = req.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    return withCsrf(NextResponse.redirect(url));
  };

  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE));
  const hasGate = Boolean(req.cookies.get(COUNTER_GATE_COOKIE));

  if ((pathname.startsWith("/admin") || pathname.startsWith("/reception")) && !hasSession) {
    return redirectTo("/login");
  }
  if (pathname.startsWith("/counter/console") && !hasSession) return redirectTo("/counter");
  if (pathname.startsWith("/counter/select") && !hasGate && !hasSession) return redirectTo("/counter");

  return withCsrf(NextResponse.next({ request: { headers: req.headers } }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ico)$).*)",
  ],
};
