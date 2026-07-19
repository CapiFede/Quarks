/**
 * Embeddings locales para retrieval semántico de memoria.
 *
 * Modelo: `Xenova/multilingual-e5-small` (384 dims, multilingüe es/en, ~33MB
 * quantizado q8). Runtime: `@huggingface/transformers` corriendo en el WebView,
 * descarga lazy en primer uso y cache en IndexedDB del navegador.
 *
 * Singleton: una sola instancia del pipeline. La primera llamada arranca la
 * carga (download + compile WASM), las siguientes hacen cola sobre la misma
 * pipeline. Inferencias en serie (no paralelas) para no saturar CPU/memoria
 * en mobile.
 *
 * E5 es asimétrico: prepend `"query: "` para queries y `"passage: "` para
 * documentos. Esto NO es opcional: sin prefijos, la similitud baja
 * notablemente.
 *
 * Si la carga falla (sin red, OOM en Android), el módulo queda en estado
 * `"error"` y los callers caen a degradación (tratar todo como pinned).
 */
import { report } from "../../services/log";

export type EmbedderStatus = "idle" | "loading" | "ready" | "error";

export const EMBEDDING_DIMS = 384;
const MODEL_ID = "Xenova/multilingual-e5-small";

let status: EmbedderStatus = "idle";
let lastError: string | null = null;
/** Mensaje human-readable del último evento de carga (qué archivo, qué %). */
let progressLabel: string | null = null;
let pipelinePromise: Promise<EmbedderFn> | null = null;
let inferenceQueue: Promise<unknown> = Promise.resolve();

const listeners = new Set<() => void>();

type EmbedderFn = (
  text: string,
  opts: { pooling: "mean"; normalize: true },
) => Promise<{ data: Float32Array | number[] }>;

function notify(): void {
  for (const l of listeners) l();
}

function setStatus(next: EmbedderStatus, err?: string): void {
  status = next;
  lastError = err ?? null;
  notify();
}

export interface EmbedderInfo {
  status: EmbedderStatus;
  error: string | null;
  progressLabel: string | null;
}

export function getEmbedderStatus(): EmbedderInfo {
  return { status, error: lastError, progressLabel };
}

/** Suscribirse a cambios de status/progress/error. Devuelve unsubscribe. */
export function subscribeEmbedder(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Arranca la carga si todavía no se hizo. No espera al modelo: devuelve
 * inmediatamente. Útil para warm-up al abrir el panel de Quarky.
 */
export function ensureEmbedderLoading(): void {
  if (status === "idle") void getPipeline();
}

/**
 * Eventos del progress_callback de transformers.js. La forma del evento
 * cambia entre fases (descarga, ready); acá los normalizamos a un string
 * humano para la UI.
 */
interface TransformersProgressEvent {
  status?: string; // "initiate" | "download" | "progress" | "done" | "ready"
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

function handleProgress(ev: TransformersProgressEvent): void {
  const file = ev.file ?? ev.name ?? "modelo";
  switch (ev.status) {
    case "initiate":
    case "download":
      progressLabel = `descargando ${file}…`;
      break;
    case "progress": {
      const pct = typeof ev.progress === "number" ? Math.round(ev.progress) : null;
      const mb =
        typeof ev.loaded === "number" && typeof ev.total === "number" && ev.total > 0
          ? `${(ev.loaded / 1024 / 1024).toFixed(1)}/${(ev.total / 1024 / 1024).toFixed(1)}MB`
          : null;
      progressLabel = `${file} ${[pct !== null ? `${pct}%` : null, mb].filter(Boolean).join(" · ")}`;
      break;
    }
    case "done":
      progressLabel = `cargando ${file}…`;
      break;
    case "ready":
      progressLabel = null;
      break;
    default:
      // Eventos desconocidos: igual notificamos por las dudas.
      break;
  }
  notify();
}

async function getPipeline(): Promise<EmbedderFn> {
  if (pipelinePromise) return pipelinePromise;
  setStatus("loading");
  pipelinePromise = (async () => {
    try {
      const mod = await import("@huggingface/transformers");
      // q8 ≈ 33MB vs ~118MB fp32. Calidad casi idéntica para retrieval; se
      // privilegia tamaño en mobile y tiempo de carga en desktop.
      const embedder = (await mod.pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        progress_callback: handleProgress,
      } as unknown as Parameters<typeof mod.pipeline>[2])) as unknown as EmbedderFn;
      progressLabel = null;
      setStatus("ready");
      return embedder;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      progressLabel = null;
      setStatus("error", msg);
      // El status="error" + el label ya están visibles en el inspector y
      // accesibles vía `getEmbedderStatus()`. Reportamos al sink global solo si
      // es realmente fatal (el usuario va a verlo en el ErrorOverlay si abre).
      report("quarky.embeddings.load", e);
      // Reset para que un retry futuro pueda volver a intentar.
      pipelinePromise = null;
      throw e;
    }
  })();
  return pipelinePromise;
}

/** Embeds un texto, devolviendo un Float32Array normalizado de `EMBEDDING_DIMS`. */
export async function embed(text: string, kind: "query" | "passage"): Promise<Float32Array> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("embed: text vacío");
  const prefixed = kind === "query" ? `query: ${trimmed}` : `passage: ${trimmed}`;
  // Cola: inferencias en serie. Si se llama desde varios sitios a la vez, se
  // turnan. Esto NO bloquea la pipeline en sí — la promise queueada espera a
  // que termine la anterior antes de pedir la siguiente inferencia.
  const exec = async (): Promise<Float32Array> => {
    const pipe = await getPipeline();
    const out = await pipe(prefixed, { pooling: "mean", normalize: true });
    const data = out.data instanceof Float32Array ? out.data : new Float32Array(out.data);
    if (data.length !== EMBEDDING_DIMS) {
      // Catastrófico, no debería pasar con este modelo. Loggeamos y devolvemos
      // igual (mejor un vector raro que tirar el turno).
      report("quarky.embeddings.dim_mismatch", { expected: EMBEDDING_DIMS, got: data.length });
    }
    return data;
  };
  const next = inferenceQueue.then(exec, exec);
  inferenceQueue = next.catch(() => {});
  return next;
}

/**
 * Producto punto sobre vectores YA NORMALIZADOS (lo que devuelve `embed`).
 * Equivalente a similitud coseno cuando ambos son unit-length. ~1ms para 384d.
 */
export function dotProduct(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
