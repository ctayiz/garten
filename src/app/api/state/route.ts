import { NextResponse } from "next/server";
import { ensureSchema, pool } from "@/lib/db";

const PIN_CODE = process.env.APP_PIN_CODE || "1709";

function isAuthorized(request: Request) {
  const pin = request.headers.get("x-pin");
  return pin === PIN_CODE;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await ensureSchema();
  const result = await pool.query("SELECT payload FROM garden_state WHERE id = 1");

  if (result.rowCount === 0) {
    return NextResponse.json({ ok: true, state: null });
  }

  return NextResponse.json({ ok: true, state: result.rows[0].payload });
}

export async function PUT(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { state?: unknown };
  if (!body || body.state === undefined) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  await ensureSchema();
  await pool.query(
    `
      INSERT INTO garden_state (id, payload, updated_at)
      VALUES (1, $1::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    `,
    [JSON.stringify(body.state)],
  );

  return NextResponse.json({ ok: true });
}
