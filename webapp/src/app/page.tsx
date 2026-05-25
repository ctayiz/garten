"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type MainBedEntry = {
  crop: string;
  variety: string;
  notes: string;
  infoUrl: string;
  currentPhoto: string;
  finalPhoto: string;
  updatedAt: string;
};

type HighBedPlant = {
  id: string;
  crop: string;
  variety: string;
  notes: string;
  infoUrl: string;
  currentPhoto: string;
  finalPhoto: string;
};

type HighBedEntry = { plants: HighBedPlant[]; photo: string; updatedAt: string };
type BedKey = `beet-${number}` | "hochbeet-1" | "hochbeet-2";
type ViewMode = "editorial" | "dashboard";

const STORAGE_KEY = "beet-tracker-v6";
const LEGACY_STORAGE_KEYS = ["beet-tracker-v5", "beet-tracker-v4", "beet-tracker-v3", "beet-tracker-v2", "beet-tracker-v1"];
const DB_NAME = "beet-tracker-db";
const DB_STORE = "kv";
const DB_KEY = "state";
const mainBedKeys = Array.from({ length: 15 }, (_, i) => `beet-${i + 1}` as BedKey);
const highBedKeys: BedKey[] = ["hochbeet-1", "hochbeet-2"];

const emptyMainEntry: MainBedEntry = {
  crop: "",
  variety: "",
  notes: "",
  infoUrl: "",
  currentPhoto: "",
  finalPhoto: "",
  updatedAt: "",
};

const emptyHighEntry: HighBedEntry = { plants: [], photo: "", updatedAt: "" };

const row1 = mainBedKeys.slice(0, 8);
const row2 = mainBedKeys.slice(8, 15);

const createInitialMainBeds = (): Record<BedKey, MainBedEntry> =>
  Object.fromEntries(mainBedKeys.map((key) => [key, { ...emptyMainEntry }])) as Record<BedKey, MainBedEntry>;

const createInitialHighBeds = (): Record<BedKey, HighBedEntry> =>
  Object.fromEntries(highBedKeys.map((key) => [key, { ...emptyHighEntry }])) as Record<BedKey, HighBedEntry>;

const slotLabel = (key: BedKey) => {
  if (key.startsWith("hochbeet")) return key === "hochbeet-1" ? "Hochbeet 1" : "Hochbeet 2";
  const n = Number(key.split("-")[1]);
  const row = n <= 8 ? 1 : 2;
  const col = n <= 8 ? n : n - 8;
  return row === 1 ? `Hinten (Mauer) · Feld ${col}` : `Vorne (Weg) · Feld ${col}`;
};

const isHighBed = (key: BedKey): key is "hochbeet-1" | "hochbeet-2" => key.startsWith("hochbeet");

export default function Home() {
  const [mainBeds, setMainBeds] = useState<Record<BedKey, MainBedEntry>>(createInitialMainBeds);
  const [highBeds, setHighBeds] = useState<Record<BedKey, HighBedEntry>>(createInitialHighBeds);
  const [selectedKey, setSelectedKey] = useState<BedKey>("beet-1");
  const [newPlant, setNewPlant] = useState<Omit<HighBedPlant, "id">>({
    crop: "",
    variety: "",
    notes: "",
    infoUrl: "",
    currentPhoto: "",
    finalPhoto: "",
  });
  const [viewMode, setViewMode] = useState<ViewMode>("editorial");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [storageError, setStorageError] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; label: string } | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      let raw: string | null = null;
      const idbState = await idbGet<string>(DB_KEY);
      if (idbState) raw = idbState;
      if (!raw) raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const legacyKey of LEGACY_STORAGE_KEYS) {
          raw = localStorage.getItem(legacyKey);
          if (raw) break;
        }
      }
      if (!raw) {
        setIsLoaded(true);
        return;
      }
      try {
      const parsed = JSON.parse(raw) as {
        mainBeds?: Record<string, Partial<MainBedEntry> & { photo?: string }>;
        highBeds?: Record<string, Partial<HighBedEntry> & { crop?: string; variety?: string; notes?: string; infoUrl?: string; photo?: string }>;
      };
      const mergedMain = createInitialMainBeds();
      const mergedHigh = createInitialHighBeds();

      if (parsed.mainBeds) {
        mainBedKeys.forEach((k) => {
          const v = parsed.mainBeds?.[k];
          if (!v) return;
          mergedMain[k] = {
            ...emptyMainEntry,
            ...v,
            currentPhoto: v.currentPhoto || v.photo || "",
          };
        });
      }

      if (parsed.highBeds) {
        highBedKeys.forEach((k) => {
          const v = parsed.highBeds?.[k];
          if (!v) return;
          const plants = Array.isArray(v.plants)
            ? v.plants
                .filter((p) => p && p.crop)
                .map((p) => ({
                  id: p.id || crypto.randomUUID(),
                  crop: p.crop,
                  variety: p.variety || "",
                  notes: p.notes || "",
                  infoUrl: p.infoUrl || "",
                  currentPhoto: p.currentPhoto || "",
                  finalPhoto: p.finalPhoto || "",
                }))
            : v.crop
              ? [{ id: crypto.randomUUID(), crop: v.crop, variety: v.variety || "", notes: v.notes || "", infoUrl: v.infoUrl || "", currentPhoto: v.photo || "", finalPhoto: "" }]
              : [];
          mergedHigh[k] = { plants, photo: v.photo || "", updatedAt: v.updatedAt || "" };
        });
      }

      setMainBeds(mergedMain);
      setHighBeds(mergedHigh);
      } catch {}
      setIsLoaded(true);
    };
    void load();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      const payload = JSON.stringify({ mainBeds, highBeds });
      localStorage.setItem(STORAGE_KEY, payload);
      void idbSet(DB_KEY, payload);
      setStorageError("");
    } catch {
      setStorageError("Speicher voll: Bitte kleinere Bilder nutzen oder ein altes Bild entfernen.");
    }
  }, [mainBeds, highBeds, isLoaded]);

  useEffect(() => {
    if (!isModalOpen) return;
    const timer = window.setTimeout(() => firstInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [isModalOpen, selectedKey]);

  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen]);

  useEffect(() => {
    if (!zoomImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [zoomImage]);

  useEffect(() => {
    if (!savedHint) return;
    const timer = window.setTimeout(() => setSavedHint(false), 1200);
    return () => window.clearTimeout(timer);
  }, [savedHint]);

  const stats = useMemo(() => {
    const mainValues = Object.values(mainBeds);
    const mainPlanted = mainValues.filter((v) => v.crop.trim()).length;
    const highPlantCount = highBedKeys.reduce((sum, key) => sum + highBeds[key].plants.length, 0);
    const withPhoto =
      mainValues.filter((v) => v.currentPhoto || v.finalPhoto).length +
      highBedKeys.reduce((sum, key) => sum + highBeds[key].plants.filter((p) => p.currentPhoto || p.finalPhoto).length, 0);
    return { planted: mainPlanted + highPlantCount, withPhoto, mainPlanted, highPlantCount };
  }, [mainBeds, highBeds]);

  const selectedMain = !isHighBed(selectedKey) ? mainBeds[selectedKey] : null;
  const selectedHigh = isHighBed(selectedKey) ? highBeds[selectedKey] : null;

  const openModal = (key: BedKey) => {
    setSelectedKey(key);
    setIsModalOpen(true);
    setNewPlant({ crop: "", variety: "", notes: "", infoUrl: "", currentPhoto: "", finalPhoto: "" });
    setSavedHint(false);
  };

  const updateMainEntry = (patch: Partial<MainBedEntry>) => {
    if (isHighBed(selectedKey)) return;
    setMainBeds((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch, updatedAt: new Date().toLocaleDateString("de-DE") } }));
    setSavedHint(true);
  };

  const updateHighEntry = (patch: Partial<HighBedEntry>) => {
    if (!isHighBed(selectedKey)) return;
    setHighBeds((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch, updatedAt: new Date().toLocaleDateString("de-DE") } }));
    setSavedHint(true);
  };

  const handleMainPhoto = async (kind: "currentPhoto" | "finalPhoto", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isHighBed(selectedKey)) return;
    const photo = await compressImageToDataUrl(file, 1280, 0.72);
    updateMainEntry({ [kind]: photo });
  };

  const handleHighBedPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isHighBed(selectedKey)) return;
    const photo = await compressImageToDataUrl(file, 1280, 0.72);
    updateHighEntry({ photo });
  };

  const handleNewPlantPhoto = async (kind: "currentPhoto" | "finalPhoto", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = await compressImageToDataUrl(file, 900, 0.7);
    setNewPlant((prev) => ({ ...prev, [kind]: photo }));
  };

  const addPlantToHighBed = () => {
    if (!isHighBed(selectedKey) || !newPlant.crop.trim()) return;
    updateHighEntry({ plants: [...highBeds[selectedKey].plants, { id: crypto.randomUUID(), ...newPlant, crop: newPlant.crop.trim(), variety: newPlant.variety.trim(), notes: newPlant.notes.trim(), infoUrl: newPlant.infoUrl.trim() }] });
    setNewPlant({ crop: "", variety: "", notes: "", infoUrl: "", currentPhoto: "", finalPhoto: "" });
  };

  const removePlantFromHighBed = (id: string) => {
    if (!isHighBed(selectedKey)) return;
    updateHighEntry({ plants: highBeds[selectedKey].plants.filter((p) => p.id !== id) });
  };

  const clearCurrent = () => {
    if (isHighBed(selectedKey)) setHighBeds((prev) => ({ ...prev, [selectedKey]: { ...emptyHighEntry } }));
    else setMainBeds((prev) => ({ ...prev, [selectedKey]: { ...emptyMainEntry } }));
  };

  return (
    <main className={`garden-bg ${viewMode === "dashboard" ? "mode-dashboard" : "mode-editorial"} min-h-screen px-4 py-6 sm:px-6 lg:px-8`}>
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
        <section className="hero-card rounded-3xl p-6 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-emerald-950 sm:text-5xl">Gemüsegarten</h1>
              <p className="mt-2 text-sm text-emerald-900/75">Vollbreite Übersicht, Bearbeitung per Modal. Pro Pflanze: Link + aktuelles Bild + Endstadium.</p>
            </div>
            <div className="flex gap-2 rounded-full bg-white/55 p-1">
              <button onClick={() => setViewMode("editorial")} className={`mode-btn ${viewMode === "editorial" ? "mode-btn-active" : ""}`}>Editorial Garden</button>
              <button onClick={() => setViewMode("dashboard")} className={`mode-btn ${viewMode === "dashboard" ? "mode-btn-active" : ""}`}>Farm Dashboard Pro</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Gesamt Pflanzen" value={stats.planted} />
            <Stat label="Mit Bild" value={stats.withPhoto} />
            <Stat label="Hauptbeet" value={`${stats.mainPlanted}/15`} />
            <Stat label="Hochbeete Pflanzen" value={stats.highPlantCount} />
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-white/60 px-4 py-3 text-sm text-emerald-900/80">
            Real-Mapping: obere Reihe = hinten an der Mauer (8 Felder), untere Reihe = vorne am Weg (7 Felder).
          </div>
        </section>

        <section className="surface rounded-3xl p-4 sm:p-5">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Hintere Reihe (an der Mauer) · 8 Felder</p>
          <BeetRow keysRow={row1} mainBeds={mainBeds} openModal={openModal} />
          <div className="h-3" />
          <p className="mb-3 mt-1 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Vordere Reihe (am Weg) · 7 Felder</p>
          <BeetRow keysRow={row2} mainBeds={mainBeds} openModal={openModal} />
        </section>

        <section className="surface rounded-3xl p-4 sm:p-5">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Hochbeete</p>
          <div className="grid gap-3 md:grid-cols-2">
            {highBedKeys.map((key, i) => {
              const item = highBeds[key];
              return (
                <button key={key} onClick={() => openModal(key)} className="highbed-card text-left">
                  <div className="mb-3 h-44 overflow-hidden rounded-xl border border-emerald-900/10 bg-emerald-50">
                    {item.photo ? <img src={item.photo} alt={`Hochbeet ${i + 1}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-400">Kein Gesamtbild</div>}
                  </div>
                  <h3 className="text-xl font-extrabold text-emerald-950">Hochbeet {i + 1}</h3>
                  <p className="mt-1 text-sm text-zinc-600">Pflanzen: {item.plants.length}</p>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {isModalOpen ? (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsModalOpen(false)}>
            <motion.div className="surface max-h-[90vh] w-full max-w-3xl overflow-auto rounded-3xl p-5" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 className="text-2xl font-black text-emerald-950">{slotLabel(selectedKey)}</h2>
                <div className="flex items-center gap-2">
                  {savedHint ? <span className="text-xs font-bold text-emerald-700">Gespeichert</span> : null}
                  <button className="btn-ghost" onClick={() => setIsModalOpen(false)}>Schließen</button>
                </div>
              </div>
              {storageError ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{storageError}</p> : null}

              {!isHighBed(selectedKey) && selectedMain ? (
                <div className="space-y-3">
                  <Field label="Gemüse"><input ref={firstInputRef} className="field" value={selectedMain.crop} onChange={(e) => updateMainEntry({ crop: e.target.value })} /></Field>
                  <Field label="Sorte"><input className="field" value={selectedMain.variety} onChange={(e) => updateMainEntry({ variety: e.target.value })} /></Field>
                  <Field label="Link (Infos) "><input className="field" value={selectedMain.infoUrl} onChange={(e) => updateMainEntry({ infoUrl: e.target.value })} placeholder="https://..." /></Field>
                  <Field label="Notizen"><textarea className="field min-h-24" value={selectedMain.notes} onChange={(e) => updateMainEntry({ notes: e.target.value })} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Aktuelles Bild"><input type="file" accept="image/*" onChange={(e) => handleMainPhoto("currentPhoto", e)} className="upload" />{selectedMain.currentPhoto ? <img src={selectedMain.currentPhoto} alt="Aktuell" className="mt-2 h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: selectedMain.currentPhoto, label: "Aktuelles Bild" })} /> : null}</Field>
                    <Field label="Endstadium Bild"><input type="file" accept="image/*" onChange={(e) => handleMainPhoto("finalPhoto", e)} className="upload" />{selectedMain.finalPhoto ? <img src={selectedMain.finalPhoto} alt="Endstadium" className="mt-2 h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: selectedMain.finalPhoto, label: "Endstadium Bild" })} /> : null}</Field>
                  </div>
                  <div className="pt-2"><button onClick={clearCurrent} className="btn-ghost">Feld leeren</button></div>
                </div>
              ) : selectedHigh ? (
                <div className="space-y-4">
                  <Field label="Gesamtbild"><input type="file" accept="image/*" onChange={handleHighBedPhoto} className="upload" /></Field>
                  <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50/70 p-3">
                    <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">Pflanze hinzufügen</p>
                    <div className="mt-2 space-y-2">
                      <input ref={firstInputRef} className="field" value={newPlant.crop} onChange={(e) => setNewPlant((p) => ({ ...p, crop: e.target.value }))} placeholder="Gemüse" />
                      <input className="field" value={newPlant.variety} onChange={(e) => setNewPlant((p) => ({ ...p, variety: e.target.value }))} placeholder="Sorte" />
                      <input className="field" value={newPlant.infoUrl} onChange={(e) => setNewPlant((p) => ({ ...p, infoUrl: e.target.value }))} placeholder="Link (https://...)" />
                      <textarea className="field min-h-20" value={newPlant.notes} onChange={(e) => setNewPlant((p) => ({ ...p, notes: e.target.value }))} placeholder="Notiz" />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Aktuelles Bild"><input type="file" accept="image/*" onChange={(e) => handleNewPlantPhoto("currentPhoto", e)} className="upload" />{newPlant.currentPhoto ? <img src={newPlant.currentPhoto} alt="Neu aktuell" className="mt-2 h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: newPlant.currentPhoto, label: "Neues aktuelles Bild" })} /> : null}</Field>
                        <Field label="Endstadium Bild"><input type="file" accept="image/*" onChange={(e) => handleNewPlantPhoto("finalPhoto", e)} className="upload" />{newPlant.finalPhoto ? <img src={newPlant.finalPhoto} alt="Neu end" className="mt-2 h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: newPlant.finalPhoto, label: "Neues Endstadium Bild" })} /> : null}</Field>
                      </div>
                      <button onClick={addPlantToHighBed} className="btn-primary">Hinzufügen</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {selectedHigh.plants.map((plant) => (
                      <div key={plant.id} className="rounded-xl border border-emerald-900/10 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-bold text-emerald-950">{plant.crop}</p>
                            <p className="text-sm text-zinc-600">{plant.variety || "Ohne Sorte"}</p>
                            {plant.infoUrl ? <a href={plant.infoUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-700 underline">Info-Link öffnen</a> : null}
                          </div>
                          <button onClick={() => removePlantFromHighBed(plant.id)} className="btn-ghost">Entfernen</button>
                        </div>
                        <div className="mt-2 flex gap-2">
                          {plant.currentPhoto ? <img src={plant.currentPhoto} alt="Aktuell" className="h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: plant.currentPhoto, label: `${plant.crop} · Aktuell` })} /> : null}
                          {plant.finalPhoto ? <img src={plant.finalPhoto} alt="Endstadium" className="h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: plant.finalPhoto, label: `${plant.crop} · Endstadium` })} /> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="pt-2"><button onClick={clearCurrent} className="btn-ghost">Hochbeet leeren</button></div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {zoomImage ? (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoomImage(null)}>
            <motion.div className="max-w-5xl" initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <p className="mb-2 text-sm font-semibold text-white">{zoomImage.label}</p>
              <img src={zoomImage.src} alt={zoomImage.label} className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl" />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function BeetRow({ keysRow, mainBeds, openModal }: { keysRow: BedKey[]; mainBeds: Record<BedKey, MainBedEntry>; openModal: (k: BedKey) => void }) {
  return (
    <div className="pb-2">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {keysRow.map((key) => {
          const item = mainBeds[key];
          return (
            <button key={key} onClick={() => openModal(key)} className="bed-card w-full">
              <div className="mb-1 text-[11px] font-bold tracking-wide text-zinc-500 uppercase">{slotLabel(key)}</div>
              <div className="mb-2 overflow-hidden rounded-xl border border-emerald-900/10 bg-emerald-50">
                <div className="h-20 border-b border-emerald-900/10 bg-emerald-50">
                  {item.currentPhoto ? <img src={item.currentPhoto} alt={`${item.crop || slotLabel(key)} aktuell`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-400">Aktuell</div>}
                </div>
                <div className="h-20 bg-emerald-50">
                  {item.finalPhoto ? <img src={item.finalPhoto} alt={`${item.crop || slotLabel(key)} endstadium`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-400">Endstadium</div>}
                </div>
              </div>
              <div className="line-clamp-1 text-base font-bold text-emerald-950">{item.crop || "Noch frei"}</div>
              <div className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500">{item.variety || "Keine Sorte"}</div>
              {item.infoUrl ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">Link hinterlegt</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat-card rounded-2xl p-3"><p className="text-xs font-semibold text-emerald-900/70">{label}</p><p className="mt-1 text-2xl font-black text-emerald-950">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold tracking-wide text-zinc-600 uppercase">{label}</span>{children}</label>;
}

async function compressImageToDataUrl(file: File, maxSize: number, quality: number): Promise<string> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild konnte nicht geladen werden"));
    img.src = src;
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readonly");
      const store = tx.objectStore(DB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
