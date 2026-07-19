/**
 * Retrieval híbrido para inyectar memoria en el system prompt de cada turno.
 *
 * Reemplaza el `memoryForPrompt()` plano (que volcaba todo siempre). Política:
 *
 *   1. Todas las entradas con `pinned: true` se incluyen SIEMPRE, sin pasar por
 *      búsqueda semántica. Pensado para identity y preferencias fuertes.
 *   2. El resto compite vía top-K cosine search contra el mensaje del usuario.
 *      Entradas sin embedding (todavía no indexadas, o el modelo no cargó) se
 *      tratan como si no existieran — la pinned-list cubre la base.
 *
 * Si RAG está apagado en config, o si no hay `userMessage`, vuelve al
 * comportamiento legacy: incluye todas las entradas (sirve como kill switch).
 *
 * Tras inyectar, dispara `incrementUses(ids)` background (no bloquea el turno).
 */
import { report } from "../../services/log";
import { dotProduct, embed, getEmbedderStatus } from "./embeddings";
import { incrementUses, listEntries } from "./store";
import type { MemoryEntry } from "./types";

export const DEFAULT_TOP_K = 10;

export interface RetrieveOptions {
  /** Último mensaje del usuario. Si está vacío, no se hace búsqueda. */
  userMessage: string;
  /** Si false, ignora RAG y devuelve todas las entradas (modo legacy). */
  ragEnabled: boolean;
  /** Tope de entradas no-pinned a incluir vía retrieval. Default 10. */
  topK?: number;
}

/**
 * Devuelve el bloque listo para inyectar en el system prompt (sin el wrap de
 * UNTRUSTED_CONTEXT — eso lo agrega el caller).
 */
export async function retrieveMemoriesForTurn(opts: RetrieveOptions): Promise<string> {
  const entries = await listEntries();
  if (entries.length === 0) return "";

  const ragOn = opts.ragEnabled && opts.userMessage.trim().length > 0;
  const pinned = entries.filter((e) => e.pinned);
  const unpinned = entries.filter((e) => !e.pinned);

  let injected: MemoryEntry[];
  if (!ragOn) {
    injected = entries; // modo legacy / kill switch
  } else if (unpinned.length === 0) {
    injected = pinned;
  } else {
    const retrieved = await topKByCosine(opts.userMessage, unpinned, opts.topK ?? DEFAULT_TOP_K);
    injected = [...pinned, ...retrieved];
  }

  if (injected.length === 0) return "";

  // Persistir el contador en background; un fallo no impacta al turno.
  void incrementUses(injected.map((e) => e.id)).catch((e) =>
    report("quarky.retrieve.incrementUses", e),
  );

  return formatBlock(injected);
}

async function topKByCosine(
  query: string,
  pool: MemoryEntry[],
  k: number,
): Promise<MemoryEntry[]> {
  const withEmbedding = pool.filter((e) => Array.isArray(e.embedding) && e.embedding.length > 0);
  if (withEmbedding.length === 0) return [];

  // Si el embedder no está listo, intentamos cargarlo on-demand: una entrada
  // sin embedding ya filtrada arriba; acá solo nos preocupa la query. Si falla,
  // degradamos a "ningún retrieval" (los pinned salvan el turno).
  let queryVec: Float32Array;
  try {
    queryVec = await embed(query, "query");
  } catch (e) {
    report("quarky.retrieve.embedQuery", e);
    return [];
  }

  // Score uno por uno; con <500 entries, esto corre en <5ms en desktop. Si
  // crece, partimos a un index. Por ahora, lineal y simple.
  const scored = withEmbedding.map((entry) => ({
    entry,
    score: dotProduct(queryVec, entry.embedding ?? []),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k).map((s) => s.entry);
}

/** Diagnóstico para la UI. */
export function getRetrievalInfo() {
  return getEmbedderStatus();
}

/**
 * Atajo para que la UI fuerce una carga del modelo (botón "Probar embedder"
 * del inspector). Hace un embed dummy y descarta el resultado.
 */
export async function probeEmbedder(): Promise<void> {
  await embed("probe", "query");
}

function formatBlock(entries: MemoryEntry[]): string {
  return entries
    .map((e) => {
      const tag = e.pinned
        ? `### ${e.category} · ${e.id} (pinned)`
        : `### ${e.category} · ${e.id}`;
      return `${tag}\n${e.text.trim()}`;
    })
    .join("\n\n");
}
