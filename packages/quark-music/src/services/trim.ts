/**
 * IO del recorte de canciones (trim): comandos Tauri Rust (ver
 * `src-tauri/src/trim.rs`) + la decodificación que alimenta la onda y la
 * preview.
 *
 * Los bytes se leen con el plugin fs (las canciones viven dentro de AppData,
 * así que entran en el scope `appdata-read-recursive`) y se decodifican una
 * vez: del mismo `AudioBuffer` salen los picos de la onda y el audio de la
 * preview (`PreviewPlayer`), así lo que suena coincide con lo que se ve.
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

/** Lee el archivo entero (bytes), para decodificarlo. */
export function readBytes(path: string): Promise<Uint8Array> {
  return readFile(path);
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
 * Tope para decodificar. En WebKitGTK sin los plugins de GStreamer (pasaba con
 * el AppImage armado en Debian corriendo en Fedora) `decodeAudioData` no falla:
 * queda colgado para siempre, y con él el diálogo en "cargando".
 */
const DECODE_TIMEOUT_MS = 20_000;

/**
 * Decodifica el audio: el buffer (para la preview) y la pirámide de picos (para
 * dibujar la onda). Devuelve `null` si el WebView no puede decodificar ese
 * formato o no responde (el diálogo cae a la línea de tiempo sin onda ni
 * preview).
 */
export async function decode(
  bytes: Uint8Array,
): Promise<{ audio: AudioBuffer; peaks: WavePeaks } | null> {
  const AC: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  try {
    // `decodeAudioData` detacha el ArrayBuffer: le pasamos una copia propia.
    const audio = await Promise.race([
      ctx.decodeAudioData(new Uint8Array(bytes).buffer),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DECODE_TIMEOUT_MS)),
    ]);
    if (!audio) return null;
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
    return { audio, peaks: { levels } };
  } catch {
    return null;
  } finally {
    void ctx.close();
  }
}

/**
 * Reproductor de la preview: Web Audio sobre el MISMO buffer decodificado que
 * dibuja la onda. Con un `<audio>` sobre el blob no coincidían: WebKitGTK/
 * GStreamer estima la duración y las posiciones de un MP3 de bitrate variable
 * a partir del bitrate (una canción de 1:39 la daba de 1:31), y sonaba un tramo
 * anterior al que marcaba el playhead.
 */
export class PreviewPlayer {
  private ctx = new AudioContext();
  private src: AudioBufferSourceNode | null = null;
  /** `ctx.currentTime` al arrancar y posición del archivo desde la que arrancó. */
  private startedAt = 0;
  private from = 0;

  constructor(private readonly audio: AudioBuffer) {}

  get playing(): boolean {
    return this.src !== null;
  }

  /** Posición actual, en segundos del archivo. */
  position(): number {
    return this.src ? this.from + (this.ctx.currentTime - this.startedAt) : this.from;
  }

  /** Suena desde `from` y se corta sola al llegar a `until`; `onEnd` avisa ese corte. */
  play(from: number, until: number, onEnd: () => void): void {
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.audio;
    src.connect(this.ctx.destination);
    src.onended = () => {
      if (this.src !== src) return;
      this.from = this.position();
      this.src = null;
      onEnd();
    };
    void this.ctx.resume();
    src.start(0, from);
    this.startedAt = this.ctx.currentTime;
    this.from = from;
    this.src = src;
    this.setUntil(until);
  }

  /** Mueve el corte (se arrastró la manija del final mientras suena). */
  setUntil(until: number): void {
    this.src?.stop(this.ctx.currentTime + Math.max(0, until - this.position()));
  }

  /** Pausa y devuelve dónde quedó. */
  stop(): number {
    const pos = this.position();
    const src = this.src;
    this.src = null;
    this.from = pos;
    if (src) {
      src.onended = null;
      src.stop();
    }
    return pos;
  }

  close(): void {
    this.stop();
    void this.ctx.close();
  }
}
