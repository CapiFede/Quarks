/**
 * Modelo de datos de la memoria persistente de Quarky.
 *
 * El store vive en `quarky/memory.json` con la forma `{ version, entries }`.
 * Cada entrada es un hecho durable (no eventos efímeros) que el modelo o el
 * usuario quieren que persista entre conversaciones.
 *
 * Campos clave:
 *   - `id`: uuid corto estable. Los embeddings (M2) se anclan a esto, así que
 *     no cambia aunque se edite el `text`.
 *   - `pinned`: las entradas pinneadas se inyectan SIEMPRE en el system prompt
 *     (sin pasar por retrieval). El resto, en M2, pasará por top-K vectorial.
 *     Hoy todas se inyectan; el flag se persiste igual para no migrar después.
 *   - `category`: solo metadata por ahora. En M2 sirve para boosts de retrieval
 *     y para que la UI agrupe. `identity` se auto-pinea al crear.
 *   - `uses`: incrementa cuando se inyecta vía retrieval (M2+).
 *   - `embedding`: 384 dims (multilingual-e5-small) cuando exista. Ausente =
 *     pendiente de calcular.
 */

export const MEMORY_STORE_VERSION = 2;
export const MEMORY_STORE_KEY = "quarky/memory";

export type MemoryCategory =
  | "fact"
  | "identity"
  | "preference"
  | "project"
  | "task";

export const MEMORY_CATEGORIES: readonly MemoryCategory[] = [
  "fact",
  "identity",
  "preference",
  "project",
  "task",
] as const;

export function isMemoryCategory(v: unknown): v is MemoryCategory {
  return typeof v === "string" && (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

export interface MemoryEntry {
  id: string;
  text: string;
  category: MemoryCategory;
  pinned: boolean;
  uses: number;
  createdAt: number;
  updatedAt: number;
  embedding?: number[];
}

export interface MemoryStore {
  version: number;
  entries: MemoryEntry[];
}

export const EMPTY_STORE: MemoryStore = { version: MEMORY_STORE_VERSION, entries: [] };
