import { type NextRequest, NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/auth/csrf";
import { AuthError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/rbac";
import { replaceApplications } from "@/lib/csv/import";
import { parseApplicationsCsv } from "@/lib/csv/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;

// mode=preview → parse + validate, no writes. mode=commit → full replace.
export async function POST(req: NextRequest) {
  try {
    await requireUser("admin");
    await verifyCsrf(req.headers.get("x-csrf-token"));

    const mode = new URL(req.url).searchParams.get("mode") ?? "preview";
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 5 MB)." }, { status: 413 });
    }

    const parsed = parseApplicationsCsv(await file.text());
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });

    if (mode === "commit") {
      if (parsed.rows.length === 0) {
        return NextResponse.json(
          { error: "No valid rows — refusing to replace the roster with an empty file." },
          { status: 400 },
        );
      }
      const count = await replaceApplications(parsed.rows);
      return NextResponse.json({ committed: true, count });
    }

    return NextResponse.json({
      committed: false,
      valid: parsed.rows.length,
      skipped: parsed.skipped,
      errors: parsed.errors.slice(0, 20),
      sample: parsed.rows.slice(0, 5),
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[import] error:", e);
    return NextResponse.json({ error: "Import failed." }, { status: 500 });
  }
}
