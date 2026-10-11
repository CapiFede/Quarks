/**
 * Adapter de reproducción para Android.
 *
 * En Android no hay backend rodio: la app sigue usando los comandos Tauri para
 * escanear la carpeta y editar tags, pero la reproducción la maneja un
 * `HTMLAudioElement` en el WebView. Cargamos el archivo con el plugin `fs`
 * (`BaseDirectory.AppData` + `packages/music/songs/<rel>`) y lo entregamos al
 * elemento como un Object URL desde un Blob.
 *
 * Por qué Blob/Object URL y no `convertFileSrc`: la asset protocol requiere
 * configuración explícita en `tauri.conf.json` + scope por plataforma. Leer
 * los bytes vía el fs plugin reusa el mismo permiso `fs:allow-appdata-read-
 * recursive` que ya tenemos para el resto de la app.
 *
 * La API replica la de `library.ts` (play/pause/resume/stop/seek/setVolume)
 * para que el dispatcher la cambie por isAndroid sin tocar el store, más
 * `status()`, que le da al store el estado REAL del elemento (posición, fin de
 * track, error) en vez de tener que estimarlo con un reloj de pared.
 *
 * El elemento se crea una sola vez y nunca se reemplaza: el WebView de Android
 * exige un gesto del usuario para arrancar audio, y ese "desbloqueo" queda
 * pegado al elemento. Uno nuevo por track no sonaría en el auto-avance.
 */
import { readFile, BaseDirectory } from "@tauri-apps/plugin-fs";

/** Subcarpeta fija definida en src-tauri/src/music.rs (`songs_dir`). */
const SONGS_BASE = "packages/music/songs/";

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
};

/** Estado real del `<audio>`, para que el store no invente la posición. */
export interface NativeStatus {
  positionSec: number;
  /** Duración real del archivo decodificado; 0 mientras no se conoce. */
  durationSec: number;
  /** El archivo llegó al final (fin de track de verdad, no estimado). */
  ended: boolean;
  /** El elemento está cargando un track nuevo: su estado todavía no sirve. */
  loading: boolean;
  /** La carga o la decodificación falló: no va a sonar nada. */
  failed: boolean;
}

let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
/**
 * Invalida cargas en curso: solo la última llamada a `play`/`stop` toca el
 * elemento. Sin esto, dos cargas solapadas se pisan el `src` y se revocan el
 * Object URL entre sí — el elemento queda con una fuente muerta y no suena.
 */
let playSeq = 0;
let loading = false;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  return audio;
}

function mimeFor(rel: string): string {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "audio/mpeg";
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Cambia la fuente del elemento y recién ahí libera la anterior.
 *
 * El orden importa: revocar el Object URL viejo ANTES de asignar el nuevo (como
 * hacía la versión anterior) deja al elemento apuntando a un blob muerto
 * mientras dura la lectura del archivo, y si esa lectura falla o se solapa con
 * otra, el track se queda sin fuente válida y "reproduce" en silencio.
 */
function swapSource(a: HTMLAudioElement, url: string): void {
  const prev = currentUrl;
  currentUrl = url;
  a.src = url;
  // `load()` arranca la carga del recurso nuevo y limpia el estado de error de
  // una carga previa fallida; sin esto el elemento puede quedar trabado en error.
  a.load();
  // Seguro recién acá: el elemento ya no referencia el blob anterior.
  if (prev) URL.revokeObjectURL(prev);
}

export async function play(rel: string, volume: number): Promise<void> {
  const a = getAudio();
  const seq = ++playSeq;
  loading = true;
  try {
    const bytes = await readFile(SONGS_BASE + rel, { baseDir: BaseDirectory.AppData });
    // `bytes` es Uint8Array; el constructor de Blob lo acepta tal cual.
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeFor(rel) }));
    // Otra reproducción arrancó mientras leíamos: esta quedó vieja y no toca nada.
    if (seq !== playSeq) {
      URL.revokeObjectURL(url);
      return;
    }
    swapSource(a, url);
    a.volume = clamp01(volume);
    await a.play();
  } finally {
    // Si `seq` ya no es el actual, el dueño del flag es la llamada nueva.
    if (seq === playSeq) loading = false;
  }
}

export async function pause(): Promise<void> {
  getAudio().pause();
}

export async function resume(): Promise<void> {
  if (!currentUrl) return;
  await getAudio().play();
}

export async function stop(): Promise<void> {
  const a = getAudio();
  // Invalida cualquier carga en vuelo: que no resucite el audio después del stop.
  ++playSeq;
  loading = false;
  a.pause();
  a.currentTime = 0;
  a.removeAttribute("src");
  a.load();
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export async function seek(secs: number): Promise<void> {
  const a = getAudio();
  const dur = isFinite(a.duration) ? a.duration : 0;
  a.currentTime = dur > 0 ? Math.max(0, Math.min(secs, dur)) : Math.max(0, secs);
}

export async function setVolume(v: number): Promise<void> {
  getAudio().volume = clamp01(v);
}

/** Estado del elemento, o `null` si todavía no hay nada cargado. */
export function status(): NativeStatus | null {
  const a = audio;
  if (!a || !currentUrl) return null;
  return {
    positionSec: isFinite(a.currentTime) ? a.currentTime : 0,
    durationSec: isFinite(a.duration) ? a.duration : 0,
    ended: a.ended,
    loading,
    failed: a.error != null,
  };
}
