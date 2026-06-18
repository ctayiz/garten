import { NextResponse } from "next/server";
import { dataUrlToBlob, isLegacyImage, uploadGardenImage } from "@/lib/blob-storage";
import { ensureSchema, getPool } from "@/lib/db";

const PIN_CODE = process.env.APP_PIN_CODE || "1709";

type ProgressPhoto = { photo?: string };
type MainPhotoEntry = {
  currentPhoto?: string;
  finalPhoto?: string;
  progress?: ProgressPhoto[];
};
type HighPlantPhotoEntry = MainPhotoEntry;
type HighPhotoEntry = {
  photo?: string;
  plants?: HighPlantPhotoEntry[];
};
type GardenPhotoState = {
  mainBeds?: Record<string, MainPhotoEntry>;
  highBeds?: Record<string, HighPhotoEntry>;
};

async function migratePhoto(value: string | undefined, name: string) {
  if (!isLegacyImage(value)) return { value, migrated: false };
  const blob = await uploadGardenImage(dataUrlToBlob(value), name);
  return { value: blob.url, migrated: true };
}

export async function POST(request: Request) {
  if (request.headers.get("x-pin") !== PIN_CODE) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    await ensureSchema();
    const pool = getPool();
    const result = await pool.query("SELECT payload FROM garden_state WHERE id = 1");
    if (result.rowCount === 0) {
      return NextResponse.json({ ok: true, migrated: 0 });
    }

    const state = structuredClone(result.rows[0].payload) as GardenPhotoState;
    let migrated = 0;

    for (const [bedKey, entry] of Object.entries(state.mainBeds || {})) {
      const current = await migratePhoto(entry.currentPhoto, `${bedKey}-current`);
      entry.currentPhoto = current.value;
      migrated += Number(current.migrated);

      const final = await migratePhoto(entry.finalPhoto, `${bedKey}-final`);
      entry.finalPhoto = final.value;
      migrated += Number(final.migrated);

      for (const [index, progress] of (entry.progress || []).entries()) {
        const photo = await migratePhoto(progress.photo, `${bedKey}-progress-${index + 1}`);
        progress.photo = photo.value;
        migrated += Number(photo.migrated);
      }
    }

    for (const [bedKey, entry] of Object.entries(state.highBeds || {})) {
      const overview = await migratePhoto(entry.photo, `${bedKey}-overview`);
      entry.photo = overview.value;
      migrated += Number(overview.migrated);

      for (const [plantIndex, plant] of (entry.plants || []).entries()) {
        const current = await migratePhoto(plant.currentPhoto, `${bedKey}-plant-${plantIndex + 1}-current`);
        plant.currentPhoto = current.value;
        migrated += Number(current.migrated);

        const final = await migratePhoto(plant.finalPhoto, `${bedKey}-plant-${plantIndex + 1}-final`);
        plant.finalPhoto = final.value;
        migrated += Number(final.migrated);

        for (const [progressIndex, progress] of (plant.progress || []).entries()) {
          const photo = await migratePhoto(progress.photo, `${bedKey}-plant-${plantIndex + 1}-progress-${progressIndex + 1}`);
          progress.photo = photo.value;
          migrated += Number(photo.migrated);
        }
      }
    }

    if (migrated > 0) {
      await pool.query("UPDATE garden_state SET payload = $1::jsonb, updated_at = NOW() WHERE id = 1", [JSON.stringify(state)]);
    }

    return NextResponse.json({ ok: true, migrated });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "migration_failed", details: error instanceof Error ? error.message : "unknown" },
      { status: 500 },
    );
  }
}
