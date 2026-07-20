/**
 * IO del recorte de canciones (trim): comandos Tauri Rust (ver
 * `src-tauri/src/trim.rs`) + la lectura de bytes para la preview y el waveform.
 *
 * La preview usa un Blob/Object URL leyendo el archivo con el plugin fs (las
 * canciones viven dentro de AppData, así que entran en el scope
 * `appdata-read-recursive`). Mismo patrón que `androidPlayer`.
 */
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";

/** Duración exacta del archivo según ffprobe (la línea de tiempo del corte). */
export function probe(path: string): Promise<number> {
  return invoke<number>("music_trim_probe", { path });
}

/** Ruta "… (editado)" dentro de la carpeta de canciones, para guardar copia. */
export function suggestDest(srcPath: string): Promise<string> {
  return invoke<string>("music_trim_suggest_dest", { srcPath });
}

/** Recorta `srcPath` al rango [start, end] y lo escribe en `destPath` (puede
 *  ser el mismo archivo). Devuelve la ruta final. */
export function exportTrim(args: {
  srcPath: string;
  start: number;
  end: number;
  destPath: string;
}): Promise<string> {
  return invoke<string>("music_trim_export", args);
}

/** Lee el archivo entero (bytes) — reusado para la preview y el waveform. */
export function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
}

/** Object URL para `<audio>` a partir de los bytes ya leídos. */
export function blobUrl(bytes: Uint8Array, ext: string): string {
  // Copia a un ArrayBuffer propio (el tipo de `readFile` es ArrayBufferLike).
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeFor(ext) }));
}

/** Un nivel de la pirámide de picos: min/max por bucket, cuantizados a
 *  -127..127 (dividir por 127 al dibujar). */
export interface PeakLevel {
  /** Buckets por segundo de este nivel. */
  rate: number;
  min: Int8Array;
  max: Int8Array;
}

/**
 * Picos min/max multi-resolución. El nivel 0 es el más fino (~1 bucket por
 * pixel al zoom máximo del waveform) y cada nivel siguiente tiene la mitad
 * de resolución. El dibujado elige el nivel según el zoom y agrega unos pocos
 * buckets por pixel, así la onda queda nítida en cualquier nivel de zoom.
 */
export interface WavePeaks {
  levels: PeakLevel[];
}

/** Resolución del nivel más fino. Igual al zoom máximo del waveform
 *  (`MAX_PPS` en TrimWave.tsx): 1 bucket por pixel a máximo zoom. */
const BASE_RATE = 2000;

/**
 * Decodifica el audio y arma la pirámide de picos para dibujar la onda.
 * Devuelve `null` si el WebView no puede decodificar ese formato (el diálogo
 * cae a mostrar la línea de tiempo sin onda).
 */
export async function computePeaks(bytes: Uint8Array): Promise<WavePeaks | null> {
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    // `decodeAudioData` detacha el ArrayBuffer: le pasamos una copia propia.
    const audio = await ctx.decodeAudioData(new Uint8Array(bytes).buffer);
    const ch = audio.getChannelData(0);
    const count = Math.max(1, Math.ceil(audio.duration * BASE_RATE));
    const perBucket = ch.length / count;

    // Nivel base: min/max reales por bucket, normalizados al pico global.
    const fMin = new Float32Array(count);
    const fMax = new Float32Array(count);
    let peak = 0;
    for (let i = 0; i < count; i++) {
      let lo = 0;
      let hi = 0;
      const start = Math.floor(i * perBucket);
      const end = Math.min(Math.max(start + 1, Math.floor((i + 1) * perBucket)), ch.length);
      for (let j = start; j < end; j++) {
        const v = ch[j];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      fMin[i] = lo;
      fMax[i] = hi;
      if (hi > peak) peak = hi;
      if (-lo > peak) peak = -lo;
    }
    const scale = peak > 0 ? 127 / peak : 0;
    let level: PeakLevel = {
      rate: BASE_RATE,
      min: Int8Array.from(fMin, (v) => Math.round(v * scale)),
      max: Int8Array.from(fMax, (v) => Math.round(v * scale)),
    };

    // Pirámide: cada nivel junta pares de buckets del anterior. Cortamos cuando
    // el nivel ya entra entero en una pantalla (no aporta más resolución útil).
    const levels: PeakLevel[] = [level];
    while (level.min.length > 2048) {
      const n = Math.ceil(level.min.length / 2);
      const min = new Int8Array(n);
      const max = new Int8Array(n);
      for (let i = 0; i < n; i++) {
        const a = 2 * i;
        const b = Math.min(a + 1, level.min.length - 1);
        min[i] = Math.min(level.min[a], level.min[b]);
        max[i] = Math.max(level.max[a], level.max[b]);
      }
      level = { rate: level.rate / 2, min, max };
      levels.push(level);
    }
    return { levels };
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
    default:
      return "application/octet-stream";
  }
}
