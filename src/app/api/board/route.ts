import { type NextRequest, NextResponse } from "next/server";
import { getAuth } from "@/lib/auth/rbac";
import { verifyDisplayKey } from "@/lib/display-link";
import { getBoard } from "@/lib/queue/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const d = new URL(req.url).searchParams.get("d");
  const authed = (await getAuth()) !== null;
  const displayOk = await verifyDisplayKey(d);
  if (!authed && !displayOk) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getBoard());
}
