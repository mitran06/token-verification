import { redirect } from "next/navigation";
import { BrandMark } from "@/components/PageHeader";
import { getCsrfToken } from "@/lib/auth/csrf";
import { getAuth } from "@/lib/auth/rbac";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const auth = await getAuth();
  if (auth?.kind === "user") redirect(auth.user.role === "admin" ? "/admin" : "/reception");
  const csrf = await getCsrfToken();
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-ink/10 bg-paper-2 p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="h-10 w-10 text-lg" />
          <div>
            <div className="font-display text-lg font-semibold leading-tight">Staff sign in</div>
            <div className="text-xs uppercase tracking-wide text-ink/40">Verification queue</div>
          </div>
        </div>
        <LoginForm csrf={csrf} />
      </div>
    </main>
  );
}
