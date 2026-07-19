/**
 * CRUD sobre el store JSON de memoria (`quarky/memory.json`).
 *
 * Source of truth único: el array `entries` adentro del archivo. Cualquier
 * mutación pasa por `loadStore` → mutar copia → `saveStore`, y `saveStore`
 * delega en `writeJson` del core (atómico tmp+rename + cola por archivo).
 *
 * No cachea en memoria: cada lectura va a disco. Es barato (<1ms para JSONs
 * de hasta cientos de entradas) y evita problemas de stale state cuando hay
 * múltiples consumidores (UI inspector + tool del modelo + extracción
 * background) tocando el mismo store en paralelo.
 *
 * Embeddings (M2): los campos `embedding` se persisten igual que el resto. Si
 * una entrada no tiene embedding, el retrieval cae a tratarla como pinned.
 */
import { readJson, writeJson } from "../../services/store";
import { report } from "../../services/log";
import { embed } from "./embeddings";
import {
  EMPTY_STORE,
  MEMORY_STORE_KEY,
  MEMORY_STORE_VERSION,
  type MemoryCategory,
  type MemoryEntry,
  type MemoryStore,
  isMemoryCategory,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Id corto random (16 hex), mismo formato que `conversation.ts:randomId`. */
function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sanea una entrada cargada del JSON, completando defaults para campos que
 * pueda haber agregado una versión posterior. Devuelve `null` si la entrada
 * está demasiado rota como para usarse (sin `id` ni `text`).
 */
function normalizeEntry(raw: Partial<MemoryEntry> | undefined | null): MemoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const text = typeof raw.text === "string" && raw.text.trim() ? raw.text : null;
  if (!id || !text) return null;
  const now = Date.now();
  return {
    id,
    text,
    category: isMemoryCategory(raw.category) ? raw.category : "fact",
    pinned: typeof raw.pinned === "boolean" ? raw.pinned : false,
    uses: typeof raw.uses === "number" && raw.uses >= 0 ? raw.uses : 0,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
    embedding: Array.isArray(raw.embedding) ? raw.embedding : undefined,
  };
}

// ── Carga / guardado del store entero ────────────────────────────────────────

export async function loadStore(): Promise<MemoryStore> {
  const raw = await readJson<MemoryStore>(MEMORY_STORE_KEY, EMPTY_STORE);
  const entries = Array.isArray(raw.entries)
    ? raw.entries.map(normalizeEntry).filter((e): e is MemoryEntry => e !== null)
    : [];
  return { version: MEMORY_STORE_VERSION, entries };
}

export async function saveStore(store: MemoryStore): Promise<void> {
  await writeJson<MemoryStore>(MEMORY_STORE_KEY, {
    version: MEMORY_STORE_VERSION,
    entries: store.entries,
  });
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export async function listEntries(): Promise<MemoryEntry[]> {
  const store = await loadStore();
  return [...store.entries].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getEntry(id: string): Promise<MemoryEntry | null> {
  const store = await loadStore();
  return store.entries.find((e) => e.id === id) ?? null;
}

// ── Escritura ────────────────────────────────────────────────────────────────

export interface AddEntryInput {
  text: string;
  category?: MemoryCategory;
  /** Si se omite, `identity` se auto-pinea; el resto arranca sin pinear. */
  pinned?: boolean;
}

export async function addEntry(input: AddEntryInput): Promise<MemoryEntry> {
  const text = input.text.trim();
  if (!text) throw new Error("addEntry: text vacío");
  const category = input.category ?? "fact";
  const pinned = input.pinned ?? category === "identity";
  const now = Date.now();
  const entry: MemoryEntry = {
    id: randomId(),
    text,
    category,
    pinned,
    uses: 0,
    createdAt: now,
    updatedAt: now,
  };
  const store = await loadStore();
  store.entries.push(entry);
  await saveStore(store);
  // Embedding en background: el caller ve la entrada disponible al instante.
  // Si el modelo todavía no cargó, esto dispara la carga.
  void embedAndSave(entry.id, entry.text);
  return entry;
}

export interface UpdateEntryInput {
  text?: string;
  category?: MemoryCategory;
  pinned?: boolean;
}

export async function updateEntry(
  id: string,
  patch: UpdateEntryInput,
): Promise<MemoryEntry | null> {
  const store = await loadStore();
  const idx = store.entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const prev = store.entries[idx];
  const nextText = patch.text !== undefined ? patch.text.trim() : prev.text;
  if (!nextText) throw new Error("updateEntry: text vacío");
  // Si el texto cambió, el embedding (M2) queda inválido y se borra para que
  // el writer lo recompute en background.
  const textChanged = nextText !== prev.text;
  const next: MemoryEntry = {
    ...prev,
    text: nextText,
    category: patch.category ?? prev.category,
    pinned: patch.pinned ?? prev.pinned,
    updatedAt: Date.now(),
    embedding: textChanged ? undefined : prev.embedding,
  };
  store.entries[idx] = next;
  await saveStore(store);
  // Si el texto cambió, recalculamos embedding en background.
  if (textChanged) void embedAndSave(next.id, next.text);
  return next;
}

export async function deleteEntry(id: string): Promise<boolean> {
  const store = await loadStore();
  const before = store.entries.length;
  store.entries = store.entries.filter((e) => e.id !== id);
  if (store.entries.length === before) return false;
  await saveStore(store);
  return true;
}

/**
 * Bloque de memoria listo para inyectar en el system prompt. Hoy concatena
 * TODAS las entradas (mismo comportamiento que el módulo viejo). En M2 esto
 * lo reemplaza `retrieveMemoriesForTurn(userMessage)` con búsqueda vectorial,
 * y `pinned` empieza a importar.
 *
 * El caller decide si envuelve esto con `untrustedContextMessage`.
 */
export async function memoryForPrompt(): Promise<string> {
  const entries = await listEntries();
  if (entries.length === 0) return "";
  return entries
    .map((e) => {
      const tag = e.pinned ? `### ${e.category} · ${e.id} (pinned)` : `### ${e.category} · ${e.id}`;
      return `${tag}\n${e.text.trim()}`;
    })
    .join("\n\n");
}

// ── Embeddings (background) ──────────────────────────────────────────────────

/**
 * Calcula el embedding de `text` y lo persiste en la entrada `id`. Si la
 * entrada se borró antes de que termine, no-op. Best-effort: si el embedder
 * falla, loggea y deja la entrada sin embedding (el retrieval la ignora).
 */
async function embedAndSave(id: string, text: string): Promise<void> {
  try {
    const vec = await embed(text, "passage");
    const store = await loadStore();
    const idx = store.entries.findIndex((e) => e.id === id);
    if (idx === -1) return; // borrada mid-flight
    if (store.entries[idx].text !== text) return; // el texto cambió otra vez; ese update dispara su propio embed
    store.entries[idx] = { ...store.entries[idx], embedding: Array.from(vec) };
    await saveStore(store);
  } catch (e) {
    report("quarky.memory.embedAndSave:" + id, e);
  }
}

/**
 * Backfill: recorre las entradas sin embedding y las indexa una a una. Se llama
 * en background al primer `sendMessage` con RAG habilitado, o desde el botón
 * "Recalcular" del inspector. Si el embedder no carga, frena después de la
 * primera falla (no tiene sentido reintentar 100 veces seguidas).
 */
export async function backfillEmbeddings(): Promise<{ done: number; total: number }> {
  const store = await loadStore();
  const pending = store.entries.filter(
    (e) => !Array.isArray(e.embedding) || e.embedding.length === 0,
  );
  let done = 0;
  for (const e of pending) {
    try {
      await embedAndSave(e.id, e.text);
      done++;
    } catch {
      break;
    }
  }
  return { done, total: pending.length };
}

/** Cuántas entradas tienen embedding vs total. Útil para mostrar progreso en UI. */
export async function embeddingCoverage(): Promise<{ withEmbedding: number; total: number }> {
  const store = await loadStore();
  const withEmbedding = store.entries.filter(
    (e) => Array.isArray(e.embedding) && e.embedding.length > 0,
  ).length;
  return { withEmbedding, total: store.entries.length };
}

/**
 * Incrementa `uses` y `updatedAt` para las entradas indicadas. Usado por el
 * retrieval (M2+) tras inyectarlas en el system prompt. Best-effort: si falla,
 * loggea pero no rompe el turno del usuario.
 */
export async function incrementUses(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const set = new Set(ids);
  const store = await loadStore();
  let touched = false;
  for (const e of store.entries) {
    if (set.has(e.id)) {
      e.uses += 1;
      touched = true;
    }
  }
  if (touched) await saveStore(store);
}
