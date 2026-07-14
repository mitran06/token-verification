import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

// Liveness + DB reachability. Compose and the tunnel gate startup on this.
export async function GET() {
  try {
    await pool.query("SELECT 1");
    return NextResponse.json({ status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
