"use client";

import { ChangeEvent, ReactNode, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";

type MainBedEntry = {
  crop: string;
  variety: string;
  plantedAt: string;
  notes: string;
  infoUrl: string;
  currentPhoto: string;
  finalPhoto: string;
  progress: ProgressEntry[];
  reminders: ReminderItem[];
  updatedAt: string;
};

type ProgressEntry = {
  id: string;
  date: string;
  photo: string;
  note: string;
};

type ProgressDraft = Omit<ProgressEntry, "id">;

type ReminderType = "gießen" | "düngen" | "ausgeizen" | "ernten";
type ReminderItem = {
  id: string;
  type: ReminderType;
  dueDate: string;
  done: boolean;
};

type HighBedPlant = {
  id: string;
  crop: string;
  variety: string;
  notes: string;
  infoUrl: string;
  currentPhoto: string;
  finalPhoto: string;
  progress: ProgressEntry[];
};

type HighBedEntry = { plants: HighBedPlant[]; photo: string; updatedAt: string };
type BedKey = `beet-${number}` | "hochbeet-1" | "hochbeet-2";
type ViewMode = "editorial" | "dashboard";

const PIN_SESSION_KEY = "garden-pin-unlocked";
const PIN_VALUE_KEY = "garden-pin-value";
const mainBedKeys = Array.from({ length: 15 }, (_, i) => `beet-${i + 1}` as BedKey);
const highBedKeys: BedKey[] = ["hochbeet-1", "hochbeet-2"];

const emptyMainEntry: MainBedEntry = {
  crop: "",
  variety: "",
  plantedAt: "",
  notes: "",
  infoUrl: "",
  currentPhoto: "",
  finalPhoto: "",
  progress: [],
  reminders: [],
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
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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
    progress: [],
  });
  const [progressDraft, setProgressDraft] = useState({ date: "", photo: "", note: "" });
  const [activeProgressPlantId, setActiveProgressPlantId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("editorial");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(PIN_SESSION_KEY) === "1";
  });
  const [pinValue, setPinValue] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(PIN_VALUE_KEY) || "";
  });
  const [savedHint, setSavedHint] = useState(false);
  const [storageError, setStorageError] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isMigratingImages, setIsMigratingImages] = useState(false);
  const [zoomImage, setZoomImage] = useState<{ src: string; label: string } | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isUnlocked) return;
      if (!pinValue) {
        setIsLoaded(true);
        return;
      }
      try {
        const response = await fetch("/api/state", {
          headers: { "x-pin": pinValue },
          cache: "no-store",
        });
        if (!response.ok) {
          setStorageError("Datenbank konnte nicht geladen werden.");
          setIsLoaded(true);
          return;
        }
        const payload = (await response.json()) as { state: unknown };
        if (!payload.state) {
          setIsLoaded(true);
          return;
        }
        const parsed = payload.state as {
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
            progress: Array.isArray(v.progress) ? v.progress : [],
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
                  progress: Array.isArray(p.progress) ? p.progress : [],
                }))
            : v.crop
              ? [{ id: crypto.randomUUID(), crop: v.crop, variety: v.variety || "", notes: v.notes || "", infoUrl: v.infoUrl || "", currentPhoto: v.photo || "", finalPhoto: "", progress: [] }]
              : [];
          mergedHigh[k] = { plants, photo: v.photo || "", updatedAt: v.updatedAt || "" };
        });
      }

      setMainBeds(mergedMain);
      setHighBeds(mergedHigh);
      } catch {
        setStorageError("Datenbank konnte nicht geladen werden.");
      }
      setIsLoaded(true);
    };
    void load();
  }, [isUnlocked, pinValue]);

  useEffect(() => {
    if (!isLoaded || !isUnlocked || !pinValue) return;
    const save = async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-pin": pinValue,
          },
          body: JSON.stringify({ state: { mainBeds, highBeds } }),
        });
        if (!response.ok) {
          setStorageError("Datenbank konnte nicht gespeichert werden.");
          return;
        }
        setStorageError("");
      } catch {
        setStorageError("Datenbank konnte nicht gespeichert werden.");
      }
    };
    const timer = window.setTimeout(() => void save(), 500);
    return () => window.clearTimeout(timer);
  }, [mainBeds, highBeds, isLoaded, isUnlocked, pinValue]);

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
    const openReminders = mainValues.reduce((sum, entry) => sum + entry.reminders.filter((r) => !r.done).length, 0);
    const withPhoto =
      mainValues.filter((v) => v.currentPhoto || v.finalPhoto).length +
      highBedKeys.reduce((sum, key) => sum + highBeds[key].plants.filter((p) => p.currentPhoto || p.finalPhoto).length, 0);
    return { planted: mainPlanted + highPlantCount, withPhoto, mainPlanted, highPlantCount, openReminders };
  }, [mainBeds, highBeds]);

  const selectedMain = !isHighBed(selectedKey) ? mainBeds[selectedKey] : null;
  const selectedHigh = isHighBed(selectedKey) ? highBeds[selectedKey] : null;
  const legacyImageCount = useMemo(() => countLegacyImages(mainBeds, highBeds), [mainBeds, highBeds]);

  const openModal = (key: BedKey) => {
    setSelectedKey(key);
    setIsModalOpen(true);
    setNewPlant({ crop: "", variety: "", notes: "", infoUrl: "", currentPhoto: "", finalPhoto: "", progress: [] });
    setProgressDraft({ date: new Date().toISOString().slice(0, 10), photo: "", note: "" });
    setActiveProgressPlantId(null);
    setSavedHint(false);
  };

  const updateMainEntry = (patch: Partial<MainBedEntry>) => {
    if (isHighBed(selectedKey)) return;
    setMainBeds((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch, updatedAt: new Date().toLocaleDateString("de-DE") } }));
    setSavedHint(true);
  };

  const addReminder = (type: ReminderType) => {
    if (isHighBed(selectedKey)) return;
    const today = new Date().toISOString().slice(0, 10);
    setMainBeds((prev) => ({
      ...prev,
      [selectedKey]: {
        ...prev[selectedKey],
        reminders: [
          ...prev[selectedKey].reminders,
          { id: crypto.randomUUID(), type, dueDate: today, done: false },
        ],
        updatedAt: new Date().toLocaleDateString("de-DE"),
      },
    }));
    setSavedHint(true);
  };

  const updateReminder = (id: string, patch: Partial<ReminderItem>) => {
    if (isHighBed(selectedKey)) return;
    setMainBeds((prev) => ({
      ...prev,
      [selectedKey]: {
        ...prev[selectedKey],
        reminders: prev[selectedKey].reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        updatedAt: new Date().toLocaleDateString("de-DE"),
      },
    }));
    setSavedHint(true);
  };

  const removeReminder = (id: string) => {
    if (isHighBed(selectedKey)) return;
    setMainBeds((prev) => ({
      ...prev,
      [selectedKey]: {
        ...prev[selectedKey],
        reminders: prev[selectedKey].reminders.filter((r) => r.id !== id),
        updatedAt: new Date().toLocaleDateString("de-DE"),
      },
    }));
    setSavedHint(true);
  };

  const updateHighEntry = (patch: Partial<HighBedEntry>) => {
    if (!isHighBed(selectedKey)) return;
    setHighBeds((prev) => ({ ...prev, [selectedKey]: { ...prev[selectedKey], ...patch, updatedAt: new Date().toLocaleDateString("de-DE") } }));
    setSavedHint(true);
  };

  const uploadGardenPhoto = async (file: File, maxSize: number, quality: number) => {
    setIsUploading(true);
    setStorageError("");
    try {
      const compressed = await compressImageToBlob(file, maxSize, quality);
      const formData = new FormData();
      formData.append("file", compressed, file.name);
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "x-pin": pinValue },
        body: formData,
      });
      const payload = (await response.json()) as { url?: string; details?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.details || "Bild konnte nicht hochgeladen werden");
      }
      return payload.url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bild konnte nicht hochgeladen werden";
      setStorageError(friendlyStorageError(message));
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleMainPhoto = async (kind: "currentPhoto" | "finalPhoto", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isHighBed(selectedKey)) return;
    const photo = await uploadGardenPhoto(file, 1280, 0.72);
    if (photo) updateMainEntry({ [kind]: photo });
  };

  const handleHighBedPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !isHighBed(selectedKey)) return;
    const photo = await uploadGardenPhoto(file, 1280, 0.72);
    if (photo) updateHighEntry({ photo });
  };

  const handleNewPlantPhoto = async (kind: "currentPhoto" | "finalPhoto", event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = await uploadGardenPhoto(file, 900, 0.7);
    if (photo) setNewPlant((prev) => ({ ...prev, [kind]: photo }));
  };

  const handleProgressPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = await uploadGardenPhoto(file, 1000, 0.68);
    if (photo) setProgressDraft((prev) => ({ ...prev, photo }));
  };

  const resetProgressDraft = () => {
    setProgressDraft({ date: new Date().toISOString().slice(0, 10), photo: "", note: "" });
  };

  const addMainProgress = () => {
    if (isHighBed(selectedKey) || !progressDraft.photo || !progressDraft.date) return;
    updateMainEntry({
      progress: [
        ...mainBeds[selectedKey].progress,
        { id: crypto.randomUUID(), ...progressDraft, note: progressDraft.note.trim() },
      ],
    });
    resetProgressDraft();
  };

  const removeMainProgress = (id: string) => {
    if (isHighBed(selectedKey)) return;
    updateMainEntry({ progress: mainBeds[selectedKey].progress.filter((entry) => entry.id !== id) });
  };

  const openHighProgress = (plantId: string) => {
    setActiveProgressPlantId((current) => (current === plantId ? null : plantId));
    resetProgressDraft();
  };

  const addHighProgress = (plantId: string) => {
    if (!isHighBed(selectedKey) || !progressDraft.photo || !progressDraft.date) return;
    updateHighEntry({
      plants: highBeds[selectedKey].plants.map((plant) =>
        plant.id === plantId
          ? {
              ...plant,
              progress: [
                ...plant.progress,
                { id: crypto.randomUUID(), ...progressDraft, note: progressDraft.note.trim() },
              ],
            }
          : plant,
      ),
    });
    resetProgressDraft();
    setActiveProgressPlantId(null);
  };

  const removeHighProgress = (plantId: string, progressId: string) => {
    if (!isHighBed(selectedKey)) return;
    updateHighEntry({
      plants: highBeds[selectedKey].plants.map((plant) =>
        plant.id === plantId
          ? { ...plant, progress: plant.progress.filter((entry) => entry.id !== progressId) }
          : plant,
      ),
    });
  };

  const addPlantToHighBed = () => {
    if (!isHighBed(selectedKey) || !newPlant.crop.trim()) return;
    updateHighEntry({ plants: [...highBeds[selectedKey].plants, { id: crypto.randomUUID(), ...newPlant, crop: newPlant.crop.trim(), variety: newPlant.variety.trim(), notes: newPlant.notes.trim(), infoUrl: newPlant.infoUrl.trim() }] });
    setNewPlant({ crop: "", variety: "", notes: "", infoUrl: "", currentPhoto: "", finalPhoto: "", progress: [] });
  };

  const removePlantFromHighBed = (id: string) => {
    if (!isHighBed(selectedKey)) return;
    updateHighEntry({ plants: highBeds[selectedKey].plants.filter((p) => p.id !== id) });
  };

  const clearCurrent = () => {
    if (isHighBed(selectedKey)) setHighBeds((prev) => ({ ...prev, [selectedKey]: { ...emptyHighEntry } }));
    else setMainBeds((prev) => ({ ...prev, [selectedKey]: { ...emptyMainEntry } }));
  };

  const migrateLegacyImages = async () => {
    setIsMigratingImages(true);
    setStorageError("");
    try {
      const response = await fetch("/api/migrate-images", {
        method: "POST",
        headers: { "x-pin": pinValue },
      });
      const payload = (await response.json()) as { migrated?: number; details?: string };
      if (!response.ok) throw new Error(payload.details || "Alte Bilder konnten nicht migriert werden.");
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Alte Bilder konnten nicht migriert werden.";
      setStorageError(friendlyStorageError(message));
      setIsMigratingImages(false);
    }
  };

  if (!isClient) {
    return <main className="garden-bg min-h-screen" />;
  }

  const unlockWithPin = async () => {
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });
      if (!response.ok) {
        setPinError("PIN ist falsch.");
        return;
      }
      sessionStorage.setItem(PIN_SESSION_KEY, "1");
      sessionStorage.setItem(PIN_VALUE_KEY, pinInput);
      setPinValue(pinInput);
      setIsUnlocked(true);
      setPinError("");
      setPinInput("");
    } catch {
      setPinError("Login fehlgeschlagen.");
    }
  };

  if (!isUnlocked) {
    return (
      <main className="garden-bg min-h-screen px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-md items-center justify-center">
          <section className="surface w-full rounded-3xl p-6 sm:p-7">
            <h1 className="text-2xl font-black text-emerald-950">Garten Login</h1>
            <p className="mt-2 text-sm text-zinc-600">Bitte PIN eingeben, um die App zu öffnen.</p>
            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-bold tracking-wide text-zinc-600 uppercase">PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") unlockWithPin();
                }}
                className="field"
                placeholder="****"
                autoFocus
              />
            </label>
            {pinError ? <p className="mt-2 text-xs font-semibold text-rose-700">{pinError}</p> : null}
            <button onClick={unlockWithPin} className="btn-primary mt-4 w-full py-2.5">Öffnen</button>
          </section>
        </div>
      </main>
    );
  }

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
            <Stat label="Offene Erinnerungen" value={stats.openReminders} />
          </div>
          <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-white/60 px-4 py-3 text-sm text-emerald-900/80">
            Real-Mapping: obere Reihe = hinten an der Mauer (8 Felder), untere Reihe = vorne am Weg (7 Felder).
          </div>
          {legacyImageCount > 0 ? (
            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-amber-700/20 bg-amber-50/90 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-extrabold text-amber-950">{legacyImageCount} ältere Bilder verlangsamen noch die App</p>
                <p className="mt-1 text-xs text-amber-900/75">Einmalig zu Vercel Blob verschieben. Inhalte und Zuordnung bleiben erhalten.</p>
                {storageError ? <p className="mt-2 rounded-lg bg-rose-100 px-2.5 py-2 text-xs font-bold text-rose-800">{storageError}</p> : null}
              </div>
              <button type="button" onClick={migrateLegacyImages} disabled={isMigratingImages} className="btn-primary shrink-0 disabled:opacity-50">
                {isMigratingImages ? "Wird optimiert ..." : "Bilder jetzt optimieren"}
              </button>
            </div>
          ) : null}
        </section>

        <section className="surface rounded-3xl p-4 sm:p-5">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Hintere Reihe (an der Mauer) · 8 Felder</p>
          <BeetRow keysRow={row1} mainBeds={mainBeds} openModal={openModal} setZoomImage={setZoomImage} />
          <div className="h-3" />
          <p className="mb-3 mt-1 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Vordere Reihe (am Weg) · 7 Felder</p>
          <BeetRow keysRow={row2} mainBeds={mainBeds} openModal={openModal} setZoomImage={setZoomImage} />
        </section>

        <section className="surface rounded-3xl p-4 sm:p-5">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-zinc-500 uppercase">Hochbeete</p>
          <div className="grid gap-3 md:grid-cols-2">
            {highBedKeys.map((key, i) => {
              const item = highBeds[key];
              return (
                <div key={key} className="highbed-card text-left">
                  <button
                    type="button"
                    onClick={() => item.photo && setZoomImage({ src: item.photo, label: `Hochbeet ${i + 1} · Gesamtbild` })}
                    className="mb-3 block h-44 w-full overflow-hidden rounded-xl border border-emerald-900/10 bg-emerald-50"
                  >
                    {item.photo ? <img src={item.photo} alt={`Hochbeet ${i + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-zinc-400">Kein Gesamtbild</div>}
                  </button>
                  <h3 className="text-xl font-extrabold text-emerald-950">Hochbeet {i + 1}</h3>
                  <p className="mt-1 text-sm text-zinc-600">Pflanzen: {item.plants.length}</p>
                  <button onClick={() => openModal(key)} className="btn-primary mt-3 w-full py-2 text-sm">
                    {item.photo || item.plants.length > 0 ? "Bearbeiten" : "Hinzufügen"}
                  </button>
                </div>
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
                  {isUploading ? <span className="text-xs font-bold text-amber-700">Bild wird geladen ...</span> : null}
                  {savedHint && !isUploading ? <span className="text-xs font-bold text-emerald-700">Gespeichert</span> : null}
                  <button className="btn-ghost" onClick={() => setIsModalOpen(false)}>Schließen</button>
                </div>
              </div>
              {storageError ? <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{storageError}</p> : null}

              {!isHighBed(selectedKey) && selectedMain ? (
                <div className="space-y-3">
                  <Field label="Gemüse"><input ref={firstInputRef} className="field" value={selectedMain.crop} onChange={(e) => updateMainEntry({ crop: e.target.value })} /></Field>
                  <Field label="Sorte"><input className="field" value={selectedMain.variety} onChange={(e) => updateMainEntry({ variety: e.target.value })} /></Field>
                  <Field label="Wann eingepflanzt"><input type="date" className="field" value={selectedMain.plantedAt} onChange={(e) => updateMainEntry({ plantedAt: e.target.value })} /></Field>
                  <Field label="Link (Infos) "><input className="field" value={selectedMain.infoUrl} onChange={(e) => updateMainEntry({ infoUrl: e.target.value })} placeholder="https://..." /></Field>
                  <Field label="Notizen"><textarea className="field min-h-24" value={selectedMain.notes} onChange={(e) => updateMainEntry({ notes: e.target.value })} /></Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Aktuelles Bild"><input type="file" accept="image/*" onChange={(e) => handleMainPhoto("currentPhoto", e)} className="upload" />{selectedMain.currentPhoto ? <img src={selectedMain.currentPhoto} alt="Aktuell" loading="lazy" decoding="async" className="mt-2 h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: selectedMain.currentPhoto, label: "Aktuelles Bild" })} /> : null}</Field>
                    <Field label="Endstadium Bild"><input type="file" accept="image/*" onChange={(e) => handleMainPhoto("finalPhoto", e)} className="upload" />{selectedMain.finalPhoto ? <img src={selectedMain.finalPhoto} alt="Endstadium" loading="lazy" decoding="async" className="mt-2 h-20 w-20 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: selectedMain.finalPhoto, label: "Endstadium Bild" })} /> : null}</Field>
                  </div>
                  <section className="rounded-2xl border border-emerald-900/10 bg-white/70 p-3 sm:p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">Wachstumsverlauf</p>
                        <p className="mt-1 text-xs text-zinc-500">Zwischenstände mit Datum dokumentieren.</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">{selectedMain.progress.length}</span>
                    </div>
                    <ProgressComposer draft={progressDraft} setDraft={setProgressDraft} onPhoto={handleProgressPhoto} onAdd={addMainProgress} />
                    <ProgressTimeline entries={selectedMain.progress} label={selectedMain.crop || slotLabel(selectedKey)} onZoom={setZoomImage} onDelete={removeMainProgress} />
                  </section>
                  <div className="pt-2"><button onClick={clearCurrent} className="btn-ghost">Feld leeren</button></div>

                  <div className="mt-3 rounded-2xl border border-emerald-900/10 bg-emerald-50/70 p-3">
                    <p className="text-xs font-bold tracking-wide text-zinc-600 uppercase">Pflanzenkalender</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button onClick={() => addReminder("gießen")} className="btn-ghost text-xs">+ Gießen</button>
                      <button onClick={() => addReminder("düngen")} className="btn-ghost text-xs">+ Düngen</button>
                      <button onClick={() => addReminder("ausgeizen")} className="btn-ghost text-xs">+ Ausgeizen</button>
                      <button onClick={() => addReminder("ernten")} className="btn-ghost text-xs">+ Ernten</button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {selectedMain.reminders.length === 0 ? (
                        <p className="text-xs text-zinc-500">Noch keine Erinnerungen hinterlegt.</p>
                      ) : (
                        selectedMain.reminders.map((r) => (
                          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-900/10 bg-white/70 p-2">
                            <input type="checkbox" checked={r.done} onChange={(e) => updateReminder(r.id, { done: e.target.checked })} />
                            <span className={`text-sm font-semibold ${r.done ? "text-zinc-400 line-through" : "text-emerald-900"}`}>{r.type}</span>
                            <input type="date" className="field max-w-[170px] !py-1.5" value={r.dueDate} onChange={(e) => updateReminder(r.id, { dueDate: e.target.value })} />
                            <button onClick={() => removeReminder(r.id)} className="btn-ghost text-xs">Löschen</button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
                        <Field label="Aktuelles Bild"><input type="file" accept="image/*" onChange={(e) => handleNewPlantPhoto("currentPhoto", e)} className="upload" />{newPlant.currentPhoto ? <img src={newPlant.currentPhoto} alt="Neu aktuell" loading="lazy" decoding="async" className="mt-2 h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: newPlant.currentPhoto, label: "Neues aktuelles Bild" })} /> : null}</Field>
                        <Field label="Endstadium Bild"><input type="file" accept="image/*" onChange={(e) => handleNewPlantPhoto("finalPhoto", e)} className="upload" />{newPlant.finalPhoto ? <img src={newPlant.finalPhoto} alt="Neu end" loading="lazy" decoding="async" className="mt-2 h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: newPlant.finalPhoto, label: "Neues Endstadium Bild" })} /> : null}</Field>
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
                          {plant.currentPhoto ? <img src={plant.currentPhoto} alt="Aktuell" loading="lazy" decoding="async" className="h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: plant.currentPhoto, label: `${plant.crop} · Aktuell` })} /> : null}
                          {plant.finalPhoto ? <img src={plant.finalPhoto} alt="Endstadium" loading="lazy" decoding="async" className="h-16 w-16 cursor-zoom-in rounded-lg object-cover" onClick={() => setZoomImage({ src: plant.finalPhoto, label: `${plant.crop} · Endstadium` })} /> : null}
                        </div>
                        <button onClick={() => openHighProgress(plant.id)} className="btn-ghost mt-3 w-full text-sm sm:w-auto">
                          {activeProgressPlantId === plant.id ? "Abbrechen" : "+ Zwischenstand"}
                        </button>
                        {activeProgressPlantId === plant.id ? (
                          <div className="mt-3 rounded-xl bg-emerald-50/80 p-3">
                            <ProgressComposer draft={progressDraft} setDraft={setProgressDraft} onPhoto={handleProgressPhoto} onAdd={() => addHighProgress(plant.id)} />
                          </div>
                        ) : null}
                        <ProgressTimeline entries={plant.progress} label={plant.crop} onZoom={setZoomImage} onDelete={(progressId) => removeHighProgress(plant.id, progressId)} />
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
              <img src={zoomImage.src} alt={zoomImage.label} decoding="async" className="max-h-[80vh] w-auto rounded-2xl object-contain shadow-2xl" />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function BeetRow({
  keysRow,
  mainBeds,
  openModal,
  setZoomImage,
}: {
  keysRow: BedKey[];
  mainBeds: Record<BedKey, MainBedEntry>;
  openModal: (k: BedKey) => void;
  setZoomImage: (value: { src: string; label: string } | null) => void;
}) {
  return (
    <div className="pb-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        {keysRow.map((key) => {
          const item = mainBeds[key];
          const hasData = Boolean(item.crop.trim() || item.variety.trim() || item.notes.trim() || item.infoUrl.trim() || item.currentPhoto || item.finalPhoto || item.progress.length);
          return (
            <div key={key} className="bed-card w-full">
              <div className="mb-1 text-[11px] font-bold tracking-wide text-zinc-500 uppercase">{slotLabel(key)}</div>
              <button
                type="button"
                onClick={() =>
                  setZoomImage({
                    src: item.currentPhoto || item.finalPhoto || "",
                    label: `${slotLabel(key)} · ${item.currentPhoto ? "Aktuell" : "Endstadium"}`,
                  })
                }
                disabled={!item.currentPhoto && !item.finalPhoto}
                className="mb-2 block w-full overflow-hidden rounded-xl border border-emerald-900/10 bg-emerald-50 disabled:cursor-not-allowed"
              >
                <div className="h-20 border-b border-emerald-900/10 bg-emerald-50">
                  {item.currentPhoto ? <img src={item.currentPhoto} alt={`${item.crop || slotLabel(key)} aktuell`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-400">Aktuell</div>}
                </div>
                <div className="h-20 bg-emerald-50">
                  {item.finalPhoto ? <img src={item.finalPhoto} alt={`${item.crop || slotLabel(key)} endstadium`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-zinc-400">Endstadium</div>}
                </div>
              </button>
              <div className="line-clamp-1 text-base font-bold text-emerald-950">{item.crop || "Noch frei"}</div>
              <div className="mt-1 line-clamp-2 min-h-10 text-sm text-zinc-500">{item.variety || "Keine Sorte"}</div>
              {item.infoUrl ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">Link hinterlegt</div> : null}
              {item.progress.length ? <div className="mt-1 text-[11px] font-semibold text-emerald-700">{item.progress.length} Zwischenstände</div> : null}
              <button onClick={() => openModal(key)} className="btn-primary mt-3 w-full py-2 text-sm">
                {hasData ? "Bearbeiten" : "Hinzufügen"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressComposer({
  draft,
  setDraft,
  onPhoto,
  onAdd,
}: {
  draft: ProgressDraft;
  setDraft: (value: ProgressDraft | ((previous: ProgressDraft) => ProgressDraft)) => void;
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onAdd: () => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
      <Field label="Datum">
        <input type="date" className="field" value={draft.date} onChange={(event) => setDraft((previous) => ({ ...previous, date: event.target.value }))} />
      </Field>
      <Field label="Foto vom Zwischenstand">
        <input type="file" accept="image/*" capture="environment" onChange={onPhoto} className="upload" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notiz (optional)">
          <textarea className="field min-h-20" value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} placeholder="Zum Beispiel: erste Blüte, kräftiger gewachsen ..." />
        </Field>
      </div>
      {draft.photo ? (
        <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-emerald-900/10 bg-white p-2">
          <img src={draft.photo} alt="Vorschau des Zwischenstands" loading="lazy" decoding="async" className="h-16 w-16 rounded-lg object-cover" />
          <p className="text-xs font-semibold text-emerald-800">Foto bereit zum Speichern</p>
        </div>
      ) : null}
      <button type="button" onClick={onAdd} disabled={!draft.photo || !draft.date} className="btn-primary sm:col-span-2 disabled:cursor-not-allowed disabled:opacity-45">
        Zwischenstand speichern
      </button>
    </div>
  );
}

function ProgressTimeline({
  entries,
  label,
  onZoom,
  onDelete,
}: {
  entries: ProgressEntry[];
  label: string;
  onZoom: (value: { src: string; label: string } | null) => void;
  onDelete: (id: string) => void;
}) {
  const sortedEntries = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  if (!sortedEntries.length) return <p className="mt-4 text-xs text-zinc-500">Noch keine Zwischenstände aufgenommen.</p>;

  return (
    <div className="relative mt-5 space-y-4 before:absolute before:bottom-5 before:left-[7px] before:top-3 before:w-px before:bg-emerald-300">
      {sortedEntries.map((entry, index) => (
        <article key={entry.id} className="relative grid grid-cols-[16px_96px_1fr] gap-3 sm:grid-cols-[16px_128px_1fr]">
          <span className="relative z-10 mt-2 h-[15px] w-[15px] rounded-full border-[3px] border-white bg-emerald-600 shadow-sm" />
          <button type="button" onClick={() => onZoom({ src: entry.photo, label: `${label} · ${formatGardenDate(entry.date)}` })} className="overflow-hidden rounded-xl bg-emerald-100">
            <img src={entry.photo} alt={`${label} am ${formatGardenDate(entry.date)}`} loading="lazy" decoding="async" className="h-24 w-full object-cover sm:h-28" />
          </button>
          <div className="min-w-0 py-1">
            <p className="text-sm font-extrabold text-emerald-950">{formatGardenDate(entry.date)}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{entry.note || (index === 0 ? "Neuester Zwischenstand" : "Zwischenstand")}</p>
            <button type="button" onClick={() => onDelete(entry.id)} className="mt-2 text-xs font-semibold text-rose-700">Löschen</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatGardenDate(value: string) {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function friendlyStorageError(message: string) {
  if (message.includes("BLOB_READ_WRITE_TOKEN")) {
    return "Vercel Blob ist nicht mit diesem Projekt verbunden oder der Token fehlt in Production.";
  }
  if (/access|private|public/i.test(message)) {
    return "Der verbundene Blob-Speicher hat den falschen Zugriffstyp. Bitte einen öffentlichen (Public) Blob-Store verwenden.";
  }
  return message;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat-card rounded-2xl p-3"><p className="text-xs font-semibold text-emerald-900/70">{label}</p><p className="mt-1 text-2xl font-black text-emerald-950">{value}</p></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-xs font-bold tracking-wide text-zinc-600 uppercase">{label}</span>{children}</label>;
}

function countLegacyImages(mainBeds: Record<BedKey, MainBedEntry>, highBeds: Record<BedKey, HighBedEntry>) {
  let count = 0;
  const add = (value: string) => {
    if (value.startsWith("data:image/")) count += 1;
  };

  mainBedKeys.forEach((key) => {
    const entry = mainBeds[key];
    add(entry.currentPhoto);
    add(entry.finalPhoto);
    entry.progress.forEach((progress) => add(progress.photo));
  });
  highBedKeys.forEach((key) => {
    const entry = highBeds[key];
    add(entry.photo);
    entry.plants.forEach((plant) => {
      add(plant.currentPhoto);
      add(plant.finalPhoto);
      plant.progress.forEach((progress) => add(progress.photo));
    });
  });
  return count;
}

async function compressImageToBlob(file: File, maxSize: number, quality: number): Promise<Blob> {
  const src = await readFileAsDataUrl(file);
  const img = await loadImage(src);
  const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Bild konnte nicht verarbeitet werden");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Bild konnte nicht komprimiert werden"))),
      "image/jpeg",
      quality,
    );
  });
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
