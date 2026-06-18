import { put } from "@vercel/blob";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isLegacyImage(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/");
}

export async function uploadGardenImage(body: Blob, originalName: string) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }
  if (!imageTypes.has(body.type)) {
    throw new Error("Unsupported image type");
  }

  const extension = body.type === "image/png" ? "png" : body.type === "image/webp" ? "webp" : "jpg";
  const safeName = originalName.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50) || "photo";

  return put(`garden/${safeName}.${extension}`, body, {
    access: "public",
    addRandomSuffix: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
}

export function dataUrlToBlob(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL");

  const bytes = Uint8Array.from(Buffer.from(match[2], "base64"));
  return new Blob([bytes], { type: match[1] });
}
