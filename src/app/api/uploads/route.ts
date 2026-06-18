import { NextResponse } from "next/server";
import { uploadGardenImage } from "@/lib/blob-storage";

const PIN_CODE = process.env.APP_PIN_CODE || "1709";
const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;

export async function POST(request: Request) {
  if (request.headers.get("x-pin") !== PIN_CODE) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/")) {
      return NextResponse.json({ ok: false, error: "invalid_file" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ ok: false, error: "file_too_large" }, { status: 413 });
    }

    const blob = await uploadGardenImage(file, file.name);
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "upload_failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
