/**
 * IO del quark Editor: comandos Tauri Rust (ver `src-tauri/src/editor.rs`) y la
 * lectura de bytes para la preview.
 *
 * La preview usa un Blob/Object URL leyendo el archivo con el plugin fs (la
 * copia de trabajo siempre vive dentro de AppData, así que entra en el scope
 * `appdata-read-recursive`). Mismo patrón que `androidPlayer` de Música.
 */
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import type { SongRef, Segment } from "../types";

export interface ProbeResult {
  durationSec: number;
  hasVideo: boolean;
}

/** Lista los audios de la carpeta de Música (fuente principal del editor). */
export function listSongs(): Promise<SongRef[]> {
  return invoke<SongRef[]>("editor_list_songs");
}

/** Copia un archivo externo a la carpeta de trabajo; devuelve la ruta de la copia. */
export function importFile(srcPath: string): Promise<string> {
  return invoke<string>("editor_import", { srcPath });
}

/** Duración + si tiene pista de video. */
export function probe(path: string): Promise<ProbeResult> {
  return invoke<ProbeResult>("editor_probe", { path });
}

/** Ruta "… (editado)" dentro de la carpeta de Música, para copia nueva de una canción. */
export function suggestSongDest(srcPath: string): Promise<string> {
  return invoke<string>("editor_suggest_song_dest", { srcPath });
}

/** Recorta y reconcatena `srcPath` en `destPath`. Devuelve la ruta final. */
export function exportClip(args: {
  srcPath: string;
  segments: Segment[];
  destPath: string;
  hasVideo: boolean;
}): Promise<string> {
  return invoke<string>("editor_export", args);
}

/** Lee el archivo entero (bytes) — reusado para la preview y el waveform. */
export function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Object URL para `<audio>`/`<video>` a partir de los bytes ya leídos. */
export function blobUrl(bytes: Uint8Array, ext: string): string {
  // Copia a un ArrayBuffer propio (el tipo de `readFile` es ArrayBufferLike).
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeFor(ext) }));
}

/**
 * Decodifica el audio y lo reduce a `buckets` picos (0..1) para dibujar la onda.
 * Devuelve `null` si el WebView no puede decodificar ese formato (la timeline
 * cae a mostrar solo los tramos, sin onda).
 */
export async function computePeaks(bytes: Uint8Array, buckets = 1000): Promise<number[] | null> {
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    // `decodeAudioData` detacha el ArrayBuffer: le pasamos una copia propia.
    const audio = await ctx.decodeAudioData(new Uint8Array(bytes).buffer);
    const ch = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(ch.length / buckets));
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < buckets; i++) {
      let m = 0;
      const start = i * block;
      const end = Math.min(start + block, ch.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(ch[j]);
        if (v > m) m = v;
      }
      peaks.push(m);
      if (m > max) max = m;
    }
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

/** MIME aproximado por extensión (suficiente para que el WebView reproduzca). */
function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "m4a":
      return "audio/mp4";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}
