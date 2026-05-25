import { NextResponse } from "next/server";

const PIN_CODE = process.env.APP_PIN_CODE || "1709";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    if (body.pin === PIN_CODE) {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "invalid_pin" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}
