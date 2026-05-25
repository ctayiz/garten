import { NextResponse } from "next/server";
import { ensureSchema, getPool } from "@/lib/db";

export async function GET() {
  try {
    await ensureSchema();
    const pool = getPool();
    const ping = await pool.query("SELECT NOW() as now");
    return NextResponse.json({ ok: true, now: ping.rows[0].now });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
