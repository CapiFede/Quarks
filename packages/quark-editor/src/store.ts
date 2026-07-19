/**
 * Store del quark Editor: estado + acciones, compartido por la toolbar y la
 * página (sub-árboles de React separados), patrón `useSyncExternalStore` (ver
 * `packages/quark-music/src/store.ts`).
 *
 * Edición no-destructiva: el estado real es `segments`, la lista ordenada de
 * tramos a CONSERVAR sobre la línea original. Cortar = restar un rango a esa
 * lista; rejuntar = la concatenación que hace ffmpeg al exportar. Undo/redo es
 * un stack de snapshots de `segments` (baratos: son números).
 */
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Source, Segment, SongRef } from "./types";
import * as io from "./services/editor";

export type EditorStatus = "idle" | "loadingSongs" | "ready" | "exporting" | "error";

/** Modo de interacción de la timeline. */
export type EditorMode = "move" | "select";

export interface Selection {
  start: number;
  end: number;
}

export interface EditorState {
  status: EditorStatus;
  error: string | null;

  /** Catálogo del selector (canciones de Música). */
  songs: SongRef[];
  songsLoaded: boolean;

  /** Clip cargado, o null si estamos en el selector. */
  source: Source | null;
  /** Object URL para la preview (`<audio>`/`<video>`). */
  mediaUrl: string | null;
  /** Picos del waveform (0..1) o null si no se pudo decodificar. */
  peaks: number[] | null;

  /** Tramos a conservar, ordenados por `start`. */
  segments: Segment[];
  /** Rango marcado para quitar (drag en la timeline, solo en modo "select"). */
  selection: Selection | null;
  /** Modo de la timeline: mover el playhead o seleccionar un rango. */
  mode: EditorMode;

  canUndo: boolean;
  canRedo: boolean;

  // ── Reproducción de la preview ──
  playing: boolean;
  /** Posición en tiempo ORIGINAL (segundos). */
  positionSec: number;
  /** Se incrementa para pedirle a la preview que salte a `positionSec`. */
  seekNonce: number;

  /** Diálogo "guardar" abierto. */
  saveOpen: boolean;

  /** Resultado del último guardado (para el aviso de confirmación). */
  savedPath: string | null;
}

const INITIAL: EditorState = {
  status: "idle",
  error: null,
  songs: [],
  songsLoaded: false,
  source: null,
  mediaUrl: null,
  peaks: null,
  segments: [],
  selection: null,
  mode: "move",
  canUndo: false,
  canRedo: false,
  playing: false,
  positionSec: 0,
  seekNonce: 0,
  saveOpen: false,
  savedPath: null,
};

/** Extensiones que el selector ofrece importar. */
const IMPORT_FILTERS = [
  { name: "Audio / Video", extensions: ["mp3", "wav", "flac", "ogg", "m4a", "opus", "mp4", "m4v", "webm", "mov", "mkv"] },
];

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

/** Suma de la duración de los tramos conservados. */
export function keptDuration(segments: Segment[]): number {
  return segments.reduce((acc, s) => acc + Math.max(0, s.end - s.start), 0);
}

/**
 * Resta `[a, b]` a la lista de tramos: los que solapan se recortan o parten.
 * Es la única operación de edición; "rejuntar" es implícito (los tramos
 * restantes se concatenan al exportar).
 */
export function removeRange(segments: Segment[], a: number, b: number): Segment[] {
  if (b <= a) return segments;
  const out: Segment[] = [];
  for (const s of segments) {
    if (s.end <= a || s.start >= b) {
      out.push(s); // sin solape
      continue;
    }
    if (s.start < a) out.push({ start: s.start, end: a }); // punta izquierda
    if (s.end > b) out.push({ start: b, end: s.end }); // punta derecha
    // el medio queda eliminado
  }
  return out.filter((s) => s.end - s.start > 0.001);
}

/** Une tramos que se tocan (`end ≈ start` del siguiente) en uno solo. */
export function coalesce(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start - last.end < 0.0005) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Mapea un tiempo original a la posición visible siguiente dentro de un tramo. */
export function nextKeptTime(segments: Segment[], t: number): number | null {
  for (const s of segments) {
    if (t < s.end - 0.001) return Math.max(t, s.start);
  }
  return null;
}

export class EditorStore {
  private state: EditorState = INITIAL;
  private listeners = new Set<() => void>();

  // Stacks de historial fuera del snapshot (no disparan render por sí solos).
  private undoStack: Segment[][] = [];
  private redoStack: Segment[][] = [];
  /** Tiempo (seg) bajo el mouse en la timeline. Fuera del snapshot: lo lee la
   *  tecla X para cortar "donde está el mouse" sin re-renderizar en cada move. */
  private cursorT = 0;

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): EditorState => this.state;

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    // Nada pesado al abrir: el catálogo se carga al entrar al selector.
  }

  dispose(): void {
    this.revokeMedia();
    this.undoStack = [];
    this.redoStack = [];
    this.state = INITIAL;
  }

  private revokeMedia(): void {
    if (this.state.mediaUrl) URL.revokeObjectURL(this.state.mediaUrl);
  }

  // ── Selector ──
  async loadSongs(): Promise<void> {
    this.set({ status: "loadingSongs", error: null });
    try {
      const songs = await io.listSongs();
      this.set({ songs, songsLoaded: true, status: this.state.source ? "ready" : "idle" });
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  /** Carga una canción de Música como clip. */
  async openSong(song: SongRef): Promise<void> {
    await this.loadSource("music", song.path, song.path, song.name, song.ext);
  }

  /** Abre el diálogo del SO para importar un archivo externo. */
  async importExternal(): Promise<void> {
    let picked: string | null;
    try {
      const res = await openDialog({ multiple: false, directory: false, filters: IMPORT_FILTERS });
      picked = typeof res === "string" ? res : null;
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
      return;
    }
    if (!picked) return;
    this.set({ status: "loadingSongs", error: null });
    try {
      const workPath = await io.importFile(picked);
      const name = baseName(picked);
      const ext = extOf(picked);
      await this.loadSource("import", workPath, picked, name, ext);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  private async loadSource(
    origin: Source["origin"],
    workPath: string,
    originalPath: string,
    name: string,
    ext: string,
  ): Promise<void> {
    this.set({ status: "loadingSongs", error: null });
    try {
      const [{ durationSec, hasVideo }, bytes] = await Promise.all([
        io.probe(workPath),
        io.readBytes(workPath),
      ]);
      const url = io.blobUrl(bytes, ext);
      const peaks = await io.computePeaks(bytes);
      this.revokeMedia();
      this.undoStack = [];
      this.redoStack = [];
      const source: Source = { origin, workPath, originalPath, name, ext, durationSec, hasVideo };
      this.set({
        source,
        mediaUrl: url,
        peaks,
        segments: [{ start: 0, end: durationSec }],
        selection: null,
        canUndo: false,
        canRedo: false,
        playing: false,
        positionSec: 0,
        status: "ready",
      });
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  /** Vuelve al selector descartando el clip actual. */
  closeSource(): void {
    this.revokeMedia();
    this.undoStack = [];
    this.redoStack = [];
    this.set({
      source: null,
      mediaUrl: null,
      peaks: null,
      segments: [],
      selection: null,
      canUndo: false,
      canRedo: false,
      playing: false,
      positionSec: 0,
      saveOpen: false,
      savedPath: null,
      status: this.state.songsLoaded ? "idle" : "idle",
    });
  }

  // ── Modo / cursor ──
  toggleMode(): void {
    const mode = this.state.mode === "move" ? "select" : "move";
    // Al salir de "select" se descarta cualquier selección a medias.
    this.set({ mode, selection: mode === "move" ? null : this.state.selection });
  }
  setMode(mode: EditorMode): void {
    if (mode !== this.state.mode) this.set({ mode, selection: mode === "move" ? null : this.state.selection });
  }
  /** Tiempo bajo el mouse (lo actualiza la timeline en cada move; sin render). */
  setCursor(t: number): void {
    this.cursorT = t;
  }
  getCursor(): number {
    return this.cursorT;
  }

  // ── Selección / cortes ──
  setSelection(sel: Selection | null): void {
    this.set({ selection: sel });
  }

  clearSelection(): void {
    this.set({ selection: null });
  }

  /**
   * Parte en dos el tramo que contiene `t` (corte con X sin selección). No hace
   * nada si `t` cae en un hueco o justo sobre un borde. Es undoable.
   */
  splitAt(t: number): void {
    const segs = this.state.segments;
    const idx = segs.findIndex((s) => t > s.start + 0.01 && t < s.end - 0.01);
    if (idx < 0) return;
    const s = segs[idx];
    const next = [
      ...segs.slice(0, idx),
      { start: s.start, end: t },
      { start: t, end: s.end },
      ...segs.slice(idx + 1),
    ];
    this.pushHistory();
    this.set({ segments: next });
  }

  /** X: con selección, la quita; sin selección, parte en el cursor. */
  cutAtCursorOrSelection(): void {
    if (this.state.selection && Math.abs(this.state.selection.end - this.state.selection.start) > 0.01) {
      this.removeSelection();
    } else {
      this.splitAt(this.cursorT);
    }
  }

  /** Quita el rango seleccionado de los tramos (guarda snapshot para undo). */
  removeSelection(): void {
    const sel = this.state.selection;
    if (!sel) return;
    const a = Math.min(sel.start, sel.end);
    const b = Math.max(sel.start, sel.end);
    if (b - a < 0.01) return;
    const next = removeRange(this.state.segments, a, b);
    this.pushHistory();
    this.set({ segments: next, selection: null });
    // Si la posición cayó en el hueco, reubicarla al próximo tramo visible.
    const moved = nextKeptTime(next, this.state.positionSec);
    if (moved != null && Math.abs(moved - this.state.positionSec) > 0.001) {
      this.requestSeek(moved);
    }
  }

  private pushHistory(): void {
    this.undoStack.push(this.state.segments);
    this.redoStack = [];
    this.set({ canUndo: true, canRedo: false });
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.state.segments);
    this.set({
      segments: prev,
      selection: null,
      canUndo: this.undoStack.length > 0,
      canRedo: true,
    });
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.state.segments);
    this.set({
      segments: next,
      selection: null,
      canUndo: true,
      canRedo: this.redoStack.length > 0,
    });
  }

  // ── Reproducción (la preview es la fuente de verdad del elemento media) ──
  setPlaying(playing: boolean): void {
    if (this.state.playing !== playing) this.set({ playing });
  }
  setPosition(sec: number): void {
    this.set({ positionSec: sec });
  }
  requestSeek(sec: number): void {
    this.set({ positionSec: sec, seekNonce: this.state.seekNonce + 1 });
  }
  togglePlay(): void {
    this.set({ playing: !this.state.playing });
  }

  // ── Guardado ──
  openSave(): void {
    if (!this.state.source || this.state.segments.length === 0) return;
    this.set({ saveOpen: true, savedPath: null });
  }
  closeSave(): void {
    this.set({ saveOpen: false });
  }

  /**
   * Exporta el clip editado. `mode`:
   *   - "new": copia nueva. Música → carpeta de canciones; import → diálogo del SO.
   *   - "overwrite": reescribe el archivo original.
   */
  async exportClip(mode: "new" | "overwrite"): Promise<void> {
    const src = this.state.source;
    if (!src) return;
    const segments = this.state.segments;
    if (segments.length === 0) {
      this.set({ error: "No queda nada para exportar." });
      return;
    }

    let destPath: string | null = null;
    try {
      if (mode === "overwrite") {
        destPath = src.originalPath;
      } else if (src.origin === "music") {
        destPath = await io.suggestSongDest(src.originalPath);
      } else {
        const res = await saveDialog({
          defaultPath: `${src.name} (editado).${src.ext}`,
          filters: [{ name: src.ext.toUpperCase(), extensions: [src.ext] }],
        });
        destPath = res ?? null;
      }
    } catch (e) {
      this.set({ status: "error", error: messageOf(e), saveOpen: false });
      return;
    }
    if (!destPath) return; // canceló el diálogo

    this.set({ status: "exporting", error: null, playing: false });
    try {
      const finalPath = await io.exportClip({
        srcPath: src.workPath,
        // Fusiona tramos que se tocan (splits sin borrado) → corte limpio.
        segments: coalesce(segments),
        destPath,
        hasVideo: src.hasVideo,
      });
      this.set({ status: "ready", saveOpen: false, savedPath: finalPath });
    } catch (e) {
      this.set({ status: "error", error: messageOf(e), saveOpen: false });
    }
  }

  dismissSaved(): void {
    if (this.state.savedPath) this.set({ savedPath: null });
  }
}

// ── Helpers de nombre de archivo ──
function baseName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}
function extOf(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(dot + 1).toLowerCase() : "";
}
