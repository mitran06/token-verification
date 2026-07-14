import Link from "next/link";
import { BrandMark } from "@/components/PageHeader";

// Neutral landing — no queue data, no counts (fixes the legacy info leak).
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 p-8">
      <div className="text-center">
        <BrandMark className="mx-auto mb-4 block h-14 w-auto" />
        <h1 className="font-display text-3xl font-semibold tracking-tight">Verification Queue</h1>
        <p className="mt-2 text-ink/50">Amrita admissions · document verification</p>
      </div>
      <nav className="grid w-full max-w-sm gap-3">
        <Link
          href="/login"
          className="rounded-xl bg-maroon px-5 py-3.5 text-center font-medium text-white transition-colors hover:bg-maroon-600"
        >
          Staff sign in
        </Link>
        <Link
          href="/counter"
          className="rounded-xl border border-ink/15 bg-paper-2 px-5 py-3.5 text-center font-medium transition-colors hover:bg-ink/5"
        >
          Counter station
        </Link>
      </nav>
    </main>
  );
}
