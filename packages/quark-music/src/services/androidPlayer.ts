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
 * para que el dispatcher la cambie por isAndroid sin tocar el store.
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

let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

function getAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  return audio;
}

function revokeUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

function mimeFor(rel: string): string {
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "audio/mpeg";
}

export async function play(rel: string, volume: number): Promise<void> {
  const a = getAudio();
  revokeUrl();
  const bytes = await readFile(SONGS_BASE + rel, {
    baseDir: BaseDirectory.AppData,
  });
  // `bytes` es Uint8Array; el constructor de Blob lo acepta tal cual.
  const blob = new Blob([bytes], { type: mimeFor(rel) });
  currentUrl = URL.createObjectURL(blob);
  a.src = currentUrl;
  a.volume = Math.max(0, Math.min(1, volume));
  await a.play();
}

export async function pause(): Promise<void> {
  getAudio().pause();
}

export async function resume(): Promise<void> {
  await getAudio().play();
}

export async function stop(): Promise<void> {
  const a = getAudio();
  a.pause();
  a.currentTime = 0;
  a.removeAttribute("src");
  revokeUrl();
}

export async function seek(secs: number): Promise<void> {
  const a = getAudio();
  const dur = isFinite(a.duration) ? a.duration : 0;
  a.currentTime = dur > 0 ? Math.max(0, Math.min(secs, dur)) : Math.max(0, secs);
}

export async function setVolume(v: number): Promise<void> {
  getAudio().volume = Math.max(0, Math.min(1, v));
}
