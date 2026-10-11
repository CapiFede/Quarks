/**
 * Store del music quark: estado + acciones, compartido por la toolbar y la
 * página (que viven en sub-árboles de React separados). Es un store externo
 * (patrón `useSyncExternalStore`, ver §state del plan): el estado vive en la
 * instancia del quark y sobrevive a los cambios de tab; toolbar y página se
 * suscriben y quedan en sync sin un provider común.
 *
 * Reparto por Space: el ÍNDICE de playlists (id+nombre) vive en la sección
 * `music` del archivo del space (`spaces/<spaceId>.json`) vía `readSpaceSection`/
 * `writeSpaceSection`. El CONTENIDO de cada playlist (sus trackPaths) vive en
 * `packages/music/playlists/<id>.json`, y los audios en `packages/music/songs/`
 * (globales a todos los spaces). El escaneo y la reproducción son comandos Rust
 * (rodio); la posición se trackea acá con un timer.
 */
import {
  readJson,
  writeJson,
  deleteJson,
  readSpaceSection,
  writeSpaceSection,
  requestActivateSpace,
  type Space,
} from "@quarks/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Track, Playlist, PlaylistView } from "./types";
import * as library from "./services/library";
import * as mediaSession from "./services/mediaSession";
import * as downloader from "./services/download";
import type { ProbeResult } from "./services/download";
import * as trim from "./services/trim";
import type { WavePeaks } from "./services/trim";

export type MusicStatus = "idle" | "loading" | "scanning" | "ready" | "error";

/**
 * Paso del diálogo de descarga. Aislado en `MusicState.download` para que los
 * cambios frecuentes (progreso) no requieran lecturas de otros campos.
 *
 * `input`/`probing`/`preview`/`downloading` son fases de UN MISMO form (el
 * input de URL siempre visible): los errores de probe/descarga van inline en
 * `error` sin cambiar de vista, y al terminar la descarga se vuelve a `input`
 * con `completedCount` seteado. El paso `error` queda solo para fallas de
 * instalación/estado de las herramientas.
 */
export type DownloadStep =
  | "idle"
  | "needsSetup"
  | "settingUp"
  /** Chequeo semanal encontró yt-dlp nueva y la está bajando. */
  | "updatingTools"
  | "input"
  | "probing"
  | "preview"
  | "downloading"
  | "error";

export interface DownloadState {
  open: boolean;
  step: DownloadStep;
  url: string;
  toolsReady: boolean;
  /**
   * Qué falta instalar, para que el paso `needsSetup` diga la verdad. En Linux
   * es normal tener ffmpeg del sistema y que solo falte yt-dlp.
   */
  toolsMissing: { ytDlp: boolean; ffmpeg: boolean };
  setup: { name: string; pct: number } | null;
  probe: ProbeResult | null;
  customName: string;
  embedThumbnail: boolean;
  /** Playlists destino (de cualquier space; los ids son únicos globalmente). */
  targetPlaylistIds: string[];
  progress: {
    pct: number;
    index: number;
    total: number;
    title: string;
    converting: boolean;
    /** Velocidad y ETA que reporta yt-dlp; `null` mientras aún no las sabe. */
    speed: string | null;
    eta: string | null;
    /**
     * No-null mientras se auto-actualiza yt-dlp tras un fallo por binario
     * viejo. `pct` es el de la bajada del binario, no el del audio.
     */
    updatingTools: { pct: number } | null;
  } | null;
  /**
   * Canciones agregadas por la ÚLTIMA descarga completada: banner de éxito en
   * el form (que ya volvió a `input` con los campos limpios). `null` = nada
   * que anunciar; se limpia al arrancar el próximo probe.
   */
  completedCount: number | null;
  error: string | null;
}

/**
 * Paso del diálogo de recorte (trim). `loading` cubre probe + leer el archivo +
 * calcular el waveform (puede tardar unos segundos en un archivo largo).
 */
export type TrimStep = "idle" | "loading" | "ready" | "exporting" | "error";

/**
 * Estado del diálogo de recorte. Aislado en `MusicState.trim` (mismo molde que
 * `download`): los cambios frecuentes (posición de la preview) no tocan el
 * resto del estado.
 */
export interface TrimState {
  open: boolean;
  step: TrimStep;
  /** Ruta absoluta del archivo (entrada de ffmpeg y de la preview). */
  absPath: string | null;
  /** Ruta relativa del track en la biblioteca (`Track.path`). */
  trackPath: string | null;
  /** Nombre visible. */
  name: string;
  /** Duración según ffprobe (la línea de tiempo sobre la que corta ffmpeg). */
  durationSec: number;
  /** Object URL para la preview (`<audio>`). */
  mediaUrl: string | null;
  /** Picos min/max multi-resolución del waveform, o null si no se pudo decodificar. */
  peaks: WavePeaks | null;
  /** Rango a CONSERVAR, en segundos del original. */
  startSec: number;
  endSec: number;

  // ── Reproducción de la preview (confinada al rango) ──
  playing: boolean;
  positionSec: number;
  /** Se incrementa para pedirle a la preview que salte a `positionSec`. */
  seekNonce: number;

  error: string | null;
}

/** Playlists de un space, con la metadata del space para agrupar en la UI. */
export interface SpacePlaylists {
  spaceId: string;
  spaceName: string;
  /** Color de acento del space (señal visual en headers de grupo). */
  color: string;
  playlists: Playlist[];
}

export interface MusicState {
  status: MusicStatus;
  error: string | null;
  /** Todos los tracks escaneados, ordenados por artista/título. */
  tracks: Track[];

  /** Space activo (segmento de partición de las playlists). */
  spaceId: string | null;
  /** Playlists del space activo. */
  playlists: Playlist[];
  /** Playlists de los DEMÁS spaces (trackpanel agrupado + Manejar playlists). */
  otherSpaces: SpacePlaylists[];
  /** Vista seleccionada: "all" | "unassigned" | id de playlist. */
  view: PlaylistView;

  searchOpen: boolean;
  search: string;
  /** Diálogo "Manejar playlists" abierto. */
  manageOpen: boolean;

  // ── Player ──
  activePath: string | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  /** 0..1 */
  volume: number;
  shuffle: boolean;
  loop: boolean;

  download: DownloadState;
  trim: TrimState;
}

const INITIAL_TRIM: TrimState = {
  open: false,
  step: "idle",
  absPath: null,
  trackPath: null,
  name: "",
  durationSec: 0,
  mediaUrl: null,
  peaks: null,
  startSec: 0,
  endSec: 0,
  playing: false,
  positionSec: 0,
  seekNonce: 0,
  error: null,
};

const INITIAL_DOWNLOAD: DownloadState = {
  open: false,
  step: "idle",
  url: "",
  toolsReady: false,
  toolsMissing: { ytDlp: false, ffmpeg: false },
  setup: null,
  probe: null,
  customName: "",
  embedThumbnail: true,
  targetPlaylistIds: [],
  progress: null,
  completedCount: null,
  error: null,
};

const INITIAL: MusicState = {
  status: "idle",
  error: null,
  tracks: [],
  spaceId: null,
  playlists: [],
  otherSpaces: [],
  view: "all",
  searchOpen: false,
  search: "",
  manageOpen: false,
  activePath: null,
  playing: false,
  positionSec: 0,
  durationSec: 0,
  volume: 0.8,
  shuffle: false,
  loop: false,
  download: INITIAL_DOWNLOAD,
  trim: INITIAL_TRIM,
};

const TICK_MS = 250;
/** Si quedan más de estos segundos, "anterior" reinicia el track en vez de saltar. */
const PREV_RESTART_SEC = 3;
/** Largo mínimo del rango a conservar en el recorte (segundos). */
const MIN_TRIM_LEN = 0.1;

/** Id del quark: clave de su sección dentro del archivo del space. */
const QUARK_ID = "music";
/** Datos de una playlist: solo trackPaths, sin metadata del space. */
const playlistKey = (playlistId: string) => `packages/music/playlists/${playlistId}`;

interface SpaceFile {
  playlists: Array<{ id: string; name: string }>;
}

interface PlaylistFile {
  trackPaths: string[];
}

// ── Helpers puros (compartidos con la UI para la lista visible) ───────────────

/** Quita repetidos por `path` conservando el primer orden de aparición. */
function dedupeByPath<T extends { path: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.path)) continue;
    seen.add(it.path);
    out.push(it);
  }
  return out;
}

/** Resuelve la "cola" de la vista activa, en orden. No aplica el buscador. */
export function resolveQueue(state: MusicState): Track[] {
  const { view, tracks, playlists } = state;
  if (view === "all") return tracks;
  if (view === "unassigned") {
    const assigned = new Set(playlists.flatMap((p) => p.trackPaths));
    return tracks.filter((t) => !assigned.has(t.path));
  }
  const pl = playlists.find((p) => p.id === view);
  if (!pl) return tracks;
  // Una playlist nunca muestra el mismo track dos veces, aunque su archivo
  // tenga `trackPaths` repetidos (data vieja / sync): dedup por ruta.
  const byPath = new Map(tracks.map((t) => [t.path, t]));
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const p of pl.trackPaths) {
    if (seen.has(p)) continue;
    seen.add(p);
    const t = byPath.get(p);
    if (t) out.push(t);
  }
  return out;
}

/** Filtra por título/artista (case-insensitive). */
export function filterTracks(tracks: Track[], search: string): Track[] {
  const q = search.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
  );
}

function sortTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const byArtist = a.artist.localeCompare(b.artist, "es", { sensitivity: "base" });
    return byArtist !== 0
      ? byArtist
      : a.title.localeCompare(b.title, "es", { sensitivity: "base" });
  });
}

function isValidRef(r: unknown): r is { id: string; name: string } {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as { id: unknown }).id === "string" &&
    typeof (r as { name: unknown }).name === "string"
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class MusicStore {
  private state: MusicState = INITIAL;
  private listeners = new Set<() => void>();

  // Estado que no requiere re-render (vive fuera del snapshot).
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickBaseMs = 0;
  private tickBasePos = 0;
  private history: string[] = [];
  private playedBag = new Set<string>();
  private scanSeq = 0;
  private spaceSeq = 0;
  /** Invalida cargas de recorte en curso (cerrar/abrir otro track en el medio). */
  private trimSeq = 0;
  /** Playlist a seleccionar cuando termine de cargar el space pedido (ver
   *  `openPlaylist`: abrir una playlist de otro space desde "Manejar playlists"). */
  private pendingOpen: { spaceId: string; view: string } | null = null;
  // Suscripción a las teclas/controles de media del SO (MPRIS, Linux-only).
  private mediaKeysUnlisten: UnlistenFn | null = null;

  // ── Suscripción (useSyncExternalStore) ──
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): MusicState => this.state;

  private set(patch: Partial<MusicState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Ciclo de vida (lo llama el Shell) ──
  async init(): Promise<void> {
    await this.scan();
    // Conectar las teclas/controles de media del SO al player (no-op fuera de Linux).
    this.mediaKeysUnlisten = await mediaSession.listenMediaKeys({
      toggle: () => void this.togglePlay(),
      play: () => {
        if (!this.state.playing) void this.togglePlay();
      },
      pause: () => {
        if (this.state.playing) void this.togglePlay();
      },
      next: () => void this.next(),
      prev: () => void this.prev(),
      stop: () => void this.stopPlayback(),
      seek: (sec) => void this.seek(sec),
    });
  }

  dispose(): void {
    this.stopTick();
    void library.stop().catch(() => {});
    this.set({ playing: false, positionSec: 0 });
    if (this.mediaKeysUnlisten) {
      this.mediaKeysUnlisten();
      this.mediaKeysUnlisten = null;
    }
    void mediaSession.setPlayback("stopped", 0);
  }

  // ── Space → playlists ──
  async setSpace(spaceId: string): Promise<void> {
    if (this.state.spaceId === spaceId) return;
    const seq = ++this.spaceSeq;
    this.set({ spaceId, playlists: [], view: "all" });
    const playlists = await this.loadSpacePlaylists(spaceId);
    if (seq !== this.spaceSeq) return;
    // Si el space ya tiene playlists, arrancamos en la primera (no en "Todas") —
    // salvo que haya una apertura pendiente desde "Manejar playlists".
    let view: PlaylistView = playlists.length > 0 ? playlists[0].id : "all";
    if (this.pendingOpen?.spaceId === spaceId) {
      if (playlists.some((p) => p.id === this.pendingOpen?.view)) view = this.pendingOpen.view;
      this.pendingOpen = null;
    }
    this.set({ playlists, view });
    void this.refreshOtherSpaces();
  }

  /** Lee el índice de playlists de un space + los trackPaths de cada una. */
  private async loadSpacePlaylists(spaceId: string): Promise<Playlist[]> {
    const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { playlists: [] });
    const refs = section.playlists.filter(isValidRef);
    return Promise.all(
      refs.map(async (ref) => {
        const file = await readJson<PlaylistFile>(playlistKey(ref.id), { trackPaths: [] });
        const raw = Array.isArray(file.trackPaths)
          ? file.trackPaths.filter((x): x is string => typeof x === "string")
          : [];
        const trackPaths = [...new Set(raw)];
        // Auto-reparación: si el archivo tenía rutas repetidas (data vieja / sync),
        // reescribilo limpio para que el duplicado no vuelva al re-cargar.
        if (trackPaths.length !== raw.length) {
          void writeJson<PlaylistFile>(playlistKey(ref.id), { trackPaths }).catch(() => {});
        }
        return { id: ref.id, name: ref.name, trackPaths };
      }),
    );
  }

  /**
   * Recarga las playlists de los demás spaces (los que no son el activo). Las
   * consumen el trackpanel (membresía agrupada por space) y "Manejar playlists".
   */
  async refreshOtherSpaces(): Promise<void> {
    const activeId = this.state.spaceId;
    const { spaces } = await readJson<{ spaces: Space[] }>("settings", { spaces: [] });
    const others = (Array.isArray(spaces) ? spaces : []).filter((s) => s.id !== activeId);
    const loaded = await Promise.all(
      others.map(async (s) => ({
        spaceId: s.id,
        spaceName: s.name,
        color: s.color,
        playlists: await this.loadSpacePlaylists(s.id),
      })),
    );
    if (this.state.spaceId !== activeId) return; // cambió el space mientras cargaba
    this.set({ otherSpaces: loaded });
  }

  // ── Carpeta / escaneo ──
  /** Abre la carpeta fija de canciones en el explorador (para tirar música ahí). */
  async openFolder(): Promise<void> {
    await library.revealFolder();
  }

  async rescan(): Promise<void> {
    await this.scan();
  }

  private async scan(): Promise<void> {
    const seq = ++this.scanSeq;
    this.set({ status: "scanning", error: null });
    try {
      const tracks = await library.scan();
      if (seq !== this.scanSeq) return;
      this.set({ tracks: sortTracks(dedupeByPath(tracks)), status: "ready" });
    } catch (e) {
      if (seq !== this.scanSeq) return;
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  // ── Vista / búsqueda ──
  selectView(view: PlaylistView): void {
    if (view === this.state.view) return;
    this.playedBag.clear();
    this.set({ view });
  }
  toggleSearch(): void {
    const open = !this.state.searchOpen;
    this.set({ searchOpen: open, search: open ? this.state.search : "" });
  }
  setSearch(search: string): void {
    this.set({ search });
  }

  // ── Manejar playlists (diálogo) ──
  openManage(): void {
    this.set({ manageOpen: true });
    // Refrescar por si otro space cambió desde la última carga (sync, etc.).
    void this.refreshOtherSpaces();
  }
  closeManage(): void {
    this.set({ manageOpen: false });
  }

  // ── Playlists (CRUD, persistido por space + archivo individual) ──

  /** Escribe el índice del space (sección `music`): solo id+nombre de cada playlist. */
  private async persistSpaceIndex(): Promise<void> {
    if (!this.state.spaceId) return;
    await writeSpaceSection<SpaceFile>(this.state.spaceId, QUARK_ID, {
      playlists: this.state.playlists.map(({ id, name }) => ({ id, name })),
    });
  }

  /** Escribe los trackPaths de una playlist en su archivo propio. */
  private async persistPlaylist(pl: Playlist): Promise<void> {
    await writeJson<PlaylistFile>(playlistKey(pl.id), { trackPaths: pl.trackPaths });
  }

  async createPlaylist(name: string): Promise<void> {
    if (!this.state.spaceId) return;
    const pl: Playlist = {
      id: crypto.randomUUID(),
      name: name.trim() || "Nueva playlist",
      trackPaths: [],
    };
    this.set({ playlists: [...this.state.playlists, pl], view: pl.id });
    await this.persistPlaylist(pl);
    await this.persistSpaceIndex();
  }

  /** Renombra una playlist de CUALQUIER space (toolbar y "Manejar playlists"). */
  async renamePlaylist(spaceId: string, id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (spaceId === this.state.spaceId) {
      this.set({
        playlists: this.state.playlists.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
      });
      await this.persistSpaceIndex();
    } else {
      const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { playlists: [] });
      await writeSpaceSection<SpaceFile>(spaceId, QUARK_ID, {
        playlists: section.playlists.map((r) =>
          isValidRef(r) && r.id === id ? { ...r, name: trimmed } : r,
        ),
      });
      this.set({
        otherSpaces: this.state.otherSpaces.map((g) =>
          g.spaceId === spaceId
            ? {
                ...g,
                playlists: g.playlists.map((p) => (p.id === id ? { ...p, name: trimmed } : p)),
              }
            : g,
        ),
      });
    }
  }

  /**
   * Crea una playlist en CUALQUIER space sin cambiar la vista actual (la usa
   * "Manejar playlists"; el dropdown usa `createPlaylist`, que sí la abre).
   */
  async createPlaylistInSpace(spaceId: string, name: string): Promise<void> {
    const pl: Playlist = {
      id: crypto.randomUUID(),
      name: name.trim() || "Nueva playlist",
      trackPaths: [],
    };
    await this.persistPlaylist(pl);
    if (spaceId === this.state.spaceId) {
      this.set({ playlists: [...this.state.playlists, pl] });
      await this.persistSpaceIndex();
    } else {
      const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { playlists: [] });
      await writeSpaceSection<SpaceFile>(spaceId, QUARK_ID, {
        playlists: [...section.playlists, { id: pl.id, name: pl.name }],
      });
      this.set({
        otherSpaces: this.state.otherSpaces.map((g) =>
          g.spaceId === spaceId ? { ...g, playlists: [...g.playlists, pl] } : g,
        ),
      });
    }
  }

  /**
   * Abre una playlist desde "Manejar playlists", aunque sea de otro space: si es
   * del activo la selecciona directo; si no, deja la selección pendiente (la
   * aplica `setSpace` al terminar de cargar) y le pide al Shell activar el space.
   */
  openPlaylist(spaceId: string, playlistId: string): void {
    this.set({ manageOpen: false });
    if (spaceId === this.state.spaceId) {
      this.selectView(playlistId);
      return;
    }
    this.pendingOpen = { spaceId, view: playlistId };
    requestActivateSpace(spaceId);
  }

  // ── Recorte (trim): diálogo del botón "Editar" del trackpanel ──

  private setTrim(patch: Partial<TrimState>): void {
    this.set({ trim: { ...this.state.trim, ...patch } });
  }

  /**
   * Abre el diálogo de recorte con un track: pausa el player (la preview usa
   * su propio `<audio>` y no queremos dos audios a la vez), resuelve el path
   * absoluto, lee duración + bytes y calcula el waveform.
   *
   * OJO con el path: el de un `Track` es RELATIVO a la carpeta de canciones y
   * con separadores `/` (ver `TrackDto` en music.rs) — ffmpeg y el plugin fs
   * necesitan el absoluto, así que la conversión va acá.
   */
  async openTrim(track: Track): Promise<void> {
    const seq = ++this.trimSeq;
    if (this.state.playing) await this.togglePlay();

    const file = track.path.split("/").pop() ?? track.path;
    const dot = file.lastIndexOf(".");
    const name = dot > 0 ? file.slice(0, dot) : file;
    const ext = dot > 0 ? file.slice(dot + 1).toLowerCase() : "";

    this.set({
      trim: { ...INITIAL_TRIM, open: true, step: "loading", trackPath: track.path, name },
    });
    try {
      const dir = (await library.songsDir()).replace(/[\\/]+$/, "");
      const sep = dir.includes("\\") ? "\\" : "/";
      const abs = dir + sep + track.path.split("/").join(sep);

      // ffprobe es la línea de tiempo sobre la que corta ffmpeg; la duración
      // de los tags del escaneo queda de fallback por si devuelve 0.
      const probed = await trim.probe(abs);
      const durationSec = probed > 0 ? probed : track.durationSec;
      if (durationSec <= 0) throw new Error("No se pudo leer la duración del archivo.");

      const bytes = await trim.readBytes(abs);
      const url = trim.blobUrl(bytes, ext);
      const peaks = await trim.computePeaks(bytes);
      if (seq !== this.trimSeq) {
        URL.revokeObjectURL(url);
        return;
      }
      this.setTrim({
        step: "ready",
        absPath: abs,
        durationSec,
        mediaUrl: url,
        peaks,
        startSec: 0,
        endSec: durationSec,
      });
    } catch (e) {
      if (seq !== this.trimSeq) return;
      this.setTrim({ step: "error", error: messageOf(e) });
    }
  }

  closeTrim(): void {
    if (this.state.trim.step === "exporting") return; // el export no se interrumpe
    ++this.trimSeq;
    if (this.state.trim.mediaUrl) URL.revokeObjectURL(this.state.trim.mediaUrl);
    this.set({ trim: INITIAL_TRIM });
  }

  // Cada manija del recorte se clampea contra la otra: arrastrarla "de más"
  // la frena en el largo mínimo, no empuja a la otra.

  setTrimStart(sec: number): void {
    const t = this.state.trim;
    if (t.step !== "ready") return;
    this.setTrim({ startSec: Math.max(0, Math.min(sec, t.endSec - MIN_TRIM_LEN)) });
  }

  setTrimEnd(sec: number): void {
    const t = this.state.trim;
    if (t.step !== "ready") return;
    this.setTrim({ endSec: Math.min(t.durationSec, Math.max(sec, t.startSec + MIN_TRIM_LEN)) });
  }

  /** Lleva el playhead de la preview a `sec`, clampeado al rango a conservar
   *  (la preview reproduce solo lo que va a quedar). */
  trimSeek(sec: number): void {
    const t = this.state.trim;
    const clamped = Math.max(t.startSec, Math.min(t.endSec, sec));
    this.setTrim({ positionSec: clamped, seekNonce: t.seekNonce + 1 });
  }

  setTrimPlaying(playing: boolean): void {
    if (this.state.trim.playing !== playing) this.setTrim({ playing });
  }

  setTrimPosition(sec: number): void {
    this.setTrim({ positionSec: sec });
  }

  trimTogglePlay(): void {
    if (this.state.trim.step !== "ready") return;
    this.setTrim({ playing: !this.state.trim.playing });
  }

  /**
   * Exporta el recorte. `mode`:
   *   - "copy": archivo nuevo "… (editado)" en la carpeta de canciones.
   *   - "overwrite": reescribe la canción original.
   * Al terminar cierra el diálogo y reescanea (refresca la duración o hace
   * aparecer la copia). Si falla, vuelve a `ready` con el error visible: el
   * rango elegido no se pierde.
   */
  async saveTrim(mode: "copy" | "overwrite"): Promise<void> {
    const t = this.state.trim;
    if (t.step !== "ready" || !t.absPath) return;
    this.setTrim({ step: "exporting", playing: false, error: null });
    try {
      const destPath = mode === "overwrite" ? t.absPath : await trim.suggestDest(t.absPath);
      // Sobrescribir el track que está sonando: soltarlo antes (rodio lo tiene
      // abierto; en Windows el rename fallaría con el archivo en uso).
      if (mode === "overwrite" && this.state.activePath === t.trackPath) {
        await this.stopPlayback();
      }
      await trim.exportTrim({ srcPath: t.absPath, start: t.startSec, end: t.endSec, destPath });
      ++this.trimSeq;
      if (t.mediaUrl) URL.revokeObjectURL(t.mediaUrl);
      this.set({ trim: INITIAL_TRIM });
      await this.scan();
    } catch (e) {
      this.setTrim({ step: "ready", error: messageOf(e) });
    }
  }

  /**
   * Borra una playlist de CUALQUIER space: la saca del índice de su space y
   * borra su archivo de contenido. Única vía de borrado ("Manejar playlists").
   */
  async deletePlaylist(spaceId: string, id: string): Promise<void> {
    if (spaceId === this.state.spaceId) {
      this.set({
        playlists: this.state.playlists.filter((p) => p.id !== id),
        view: this.state.view === id ? "all" : this.state.view,
      });
      await this.persistSpaceIndex();
    } else {
      const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { playlists: [] });
      await writeSpaceSection<SpaceFile>(spaceId, QUARK_ID, {
        playlists: section.playlists.filter((r) => !isValidRef(r) || r.id !== id),
      });
      this.set({
        otherSpaces: this.state.otherSpaces.map((g) =>
          g.spaceId === spaceId
            ? { ...g, playlists: g.playlists.filter((p) => p.id !== id) }
            : g,
        ),
      });
    }
    await deleteJson(playlistKey(id));
  }

  async addToPlaylist(id: string, paths: string[]): Promise<void> {
    let updated: Playlist | undefined;
    this.set({
      playlists: this.state.playlists.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, trackPaths: [...new Set([...p.trackPaths, ...paths])] };
        return updated;
      }),
    });
    if (updated) await this.persistPlaylist(updated);
  }

  async removeFromPlaylist(id: string, paths: string[]): Promise<void> {
    const drop = new Set(paths);
    let updated: Playlist | undefined;
    this.set({
      playlists: this.state.playlists.map((p) => {
        if (p.id !== id) return p;
        updated = { ...p, trackPaths: p.trackPaths.filter((x) => !drop.has(x)) };
        return updated;
      }),
    });
    if (updated) await this.persistPlaylist(updated);
  }

  /**
   * Agrega/quita un track en una playlist de CUALQUIER space (trackpanel).
   * Para el space activo delega en add/removeFromPlaylist; para otros escribe
   * el archivo de la playlist (global, keyed por id) y refleja en `otherSpaces`.
   */
  async toggleInPlaylist(
    spaceId: string,
    playlistId: string,
    path: string,
    isIn: boolean,
  ): Promise<void> {
    if (spaceId === this.state.spaceId) {
      if (isIn) await this.removeFromPlaylist(playlistId, [path]);
      else await this.addToPlaylist(playlistId, [path]);
      return;
    }
    let updated: Playlist | undefined;
    this.set({
      otherSpaces: this.state.otherSpaces.map((g) => {
        if (g.spaceId !== spaceId) return g;
        return {
          ...g,
          playlists: g.playlists.map((p) => {
            if (p.id !== playlistId) return p;
            updated = {
              ...p,
              trackPaths: isIn
                ? p.trackPaths.filter((x) => x !== path)
                : [...new Set([...p.trackPaths, path])],
            };
            return updated;
          }),
        };
      }),
    });
    if (updated) await this.persistPlaylist(updated);
  }

  // ── Sync con los controles de media del SO (MPRIS) ──
  /** Empuja el track activo al widget del SO. */
  private pushMprisMetadata(): void {
    const t = this.state.tracks.find((x) => x.path === this.state.activePath);
    if (!t) return;
    void mediaSession.setMetadata({
      title: t.title,
      artist: t.artist || undefined,
      durationSec: t.durationSec || undefined,
    });
  }
  /** Empuja el estado de reproducción (+ posición) al widget del SO. */
  private pushMprisPlayback(): void {
    const s = this.state;
    if (!s.activePath) {
      void mediaSession.setPlayback("stopped", 0);
      return;
    }
    void mediaSession.setPlayback(s.playing ? "playing" : "paused", s.positionSec);
  }

  /** Para la reproducción y la refleja como "stopped" en el SO (evento Stop). */
  private async stopPlayback(): Promise<void> {
    await library.stop().catch(() => {});
    this.stopTick();
    this.set({ playing: false, positionSec: 0 });
    void mediaSession.setPlayback("stopped", 0);
  }

  // ── Player ──
  async play(path: string): Promise<void> {
    await this.playInternal(path, true);
  }

  private async playInternal(path: string, pushHistory: boolean): Promise<void> {
    const track = this.state.tracks.find((t) => t.path === path);
    try {
      await library.play(path, this.state.volume);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
      return;
    }
    if (pushHistory && this.state.activePath && this.state.activePath !== path) {
      this.history.push(this.state.activePath);
    }
    this.playedBag.add(path);
    this.set({
      activePath: path,
      playing: true,
      positionSec: 0,
      durationSec: track?.durationSec ?? 0,
      status: this.state.status === "error" ? "ready" : this.state.status,
    });
    this.startTick();
    this.pushMprisMetadata();
    this.pushMprisPlayback();
  }

  async togglePlay(): Promise<void> {
    if (!this.state.activePath) {
      // Sin track activo: arranca el primero de la cola visible.
      const q = resolveQueue(this.state);
      if (q.length > 0) await this.play(q[0].path);
      return;
    }
    if (this.state.playing) {
      await library.pause();
      this.stopTick();
      this.set({ playing: false });
    } else {
      await library.resume();
      this.set({ playing: true });
      this.startTick();
    }
    this.pushMprisPlayback();
  }

  async next(): Promise<void> {
    const q = resolveQueue(this.state);
    if (q.length === 0) return;
    const cur = this.state.activePath;
    let nextPath: string;
    if (this.state.shuffle) {
      let pool = q.filter((t) => t.path !== cur && !this.playedBag.has(t.path));
      if (pool.length === 0) {
        this.playedBag.clear();
        pool = q.filter((t) => t.path !== cur);
      }
      if (pool.length === 0) pool = q;
      nextPath = pool[Math.floor(Math.random() * pool.length)].path;
    } else {
      const idx = q.findIndex((t) => t.path === cur);
      nextPath = q[(idx + 1) % q.length].path;
    }
    await this.play(nextPath);
  }

  async prev(): Promise<void> {
    if (this.state.positionSec > PREV_RESTART_SEC) {
      await this.seek(0);
      return;
    }
    const prevPath = this.history.pop();
    if (prevPath) await this.playInternal(prevPath, false);
    else await this.seek(0);
  }

  async seek(sec: number): Promise<void> {
    const clamped = Math.max(0, Math.min(sec, this.state.durationSec || sec));
    try {
      await library.seek(clamped);
    } catch {
      // si el formato no soporta seek, igual reflejamos la posición visual
    }
    this.set({ positionSec: clamped });
    if (this.state.playing) {
      this.tickBaseMs = performance.now();
      this.tickBasePos = clamped;
    }
    this.pushMprisPlayback();
  }

  async setVolume(v: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, v));
    this.set({ volume: clamped });
    await library.setVolume(clamped);
  }

  toggleShuffle(): void {
    this.playedBag.clear();
    this.set({ shuffle: !this.state.shuffle });
  }

  /**
   * Acceso rápido del ícono de randomizar: activa shuffle (lo deja seleccionado),
   * cambia a la vista dada y arranca a reproducir un track al azar de esa cola.
   * El "siguiente" automático ya usa la lógica de shuffle existente.
   */
  async startShuffle(view: PlaylistView): Promise<void> {
    const patch: Partial<MusicState> = {};
    if (view !== this.state.view) patch.view = view;
    if (!this.state.shuffle) patch.shuffle = true;
    if (Object.keys(patch).length > 0) this.set(patch);
    this.playedBag.clear();
    const q = resolveQueue(this.state);
    if (q.length === 0) return;
    await this.play(q[Math.floor(Math.random() * q.length)].path);
  }
  toggleLoop(): void {
    this.set({ loop: !this.state.loop });
  }

  // ── Edición de tracks (borrar / renombrar) ──

  /**
   * Borra el archivo del track del disco. Rust actualiza también todos los
   * `playlists/*.json` que lo referencian; acá actualizamos el estado en
   * memoria (tracks + playlists del space activo) y limpiamos el player si
   * el track activo era el borrado.
   */
  async deleteTrack(path: string): Promise<void> {
    try {
      await library.deleteTrack(path);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
      return;
    }
    // Si el track activo era este, parar reproducción.
    if (this.state.activePath === path) {
      void library.stop().catch(() => {});
      this.stopTick();
      this.set({ activePath: null, playing: false, positionSec: 0, durationSec: 0 });
      void mediaSession.setPlayback("stopped", 0);
    }
    this.history = this.history.filter((p) => p !== path);
    this.playedBag.delete(path);
    this.set({
      tracks: this.state.tracks.filter((t) => t.path !== path),
      playlists: this.state.playlists.map((p) =>
        p.trackPaths.includes(path)
          ? { ...p, trackPaths: p.trackPaths.filter((x) => x !== path) }
          : p,
      ),
    });
  }

  /**
   * Renombra el archivo del track manteniendo su extensión y subcarpeta. Rust
   * actualiza los `playlists/*.json` y devuelve la nueva ruta relativa.
   * Reescaneamos para que `tracks` refleje el nuevo nombre + tags, y mapeamos
   * el path viejo → nuevo en las playlists del space activo y en el player.
   */
  async renameTrack(path: string, newName: string): Promise<void> {
    let newPath: string;
    try {
      newPath = await library.renameTrack(path, newName);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
      return;
    }
    // Actualizar referencias en memoria.
    if (this.state.activePath === path) {
      this.set({ activePath: newPath });
    }
    this.history = this.history.map((p) => (p === path ? newPath : p));
    if (this.playedBag.delete(path)) this.playedBag.add(newPath);
    this.set({
      playlists: this.state.playlists.map((p) =>
        p.trackPaths.includes(path)
          ? { ...p, trackPaths: p.trackPaths.map((x) => (x === path ? newPath : x)) }
          : p,
      ),
    });
    // Reescanear para que el listado refleje el nuevo nombre/tags.
    await this.scan();
    // El widget del SO mostraba el nombre viejo si era el track activo.
    if (this.state.activePath === newPath) this.pushMprisMetadata();
  }

  // ── Descarga (yt-dlp + ffmpeg) ──
  private setDownload(patch: Partial<DownloadState>): void {
    this.set({ download: { ...this.state.download, ...patch } });
  }

  async openDownload(): Promise<void> {
    this.setDownload({
      open: true,
      step: "input",
      url: "",
      probe: null,
      customName: "",
      targetPlaylistIds: [],
      progress: null,
      completedCount: null,
      error: null,
    });
    // Refrescar las playlists de los demás spaces (selector de destinos).
    void this.refreshOtherSpaces();
    try {
      const status = await downloader.toolsStatus();
      this.setDownload({
        toolsReady: status.ready,
        toolsMissing: { ytDlp: !status.ytDlp, ffmpeg: !status.ffmpeg },
        step: status.ready ? "input" : "needsSetup",
      });
      if (status.ready) await this.checkToolsUpdate();
    } catch (e) {
      this.setDownload({ step: "error", error: messageOf(e) });
    }
  }

  /**
   * Chequeo semanal de yt-dlp al abrir el diálogo. Lo esperamos en vez de
   * dispararlo en background para no cruzar el reemplazo del binario con una
   * descarga que arranque justo en el medio. Sale gratis en el caso normal: el
   * backend corta sin tocar la red si no pasaron 7 días, así que solo se ve UI
   * cuando realmente hay una versión nueva que bajar.
   *
   * Nunca bloquea el flujo: si el chequeo falla, se sigue pudiendo descargar
   * con el binario que ya está (y si resultara viejo, el auto-reintento de
   * `runDownload` lo cubre).
   */
  private async checkToolsUpdate(): Promise<void> {
    try {
      await downloader.checkToolsUpdate((p) => {
        if (p.phase === "downloading") {
          this.setDownload({ step: "updatingTools", setup: { name: "yt-dlp", pct: p.pct } });
        }
      });
    } catch {
      // Silencioso a propósito: es mantenimiento, no una acción del usuario.
    }
    this.setDownload({ step: "input", setup: null });
  }

  closeDownload(): void {
    // No cancela una descarga en curso (v1): el proceso yt-dlp sigue en background
    // hasta terminar; las canciones igual quedan agregadas al hacer el próximo scan.
    this.setDownload({
      open: false,
      step: "idle",
      probe: null,
      progress: null,
      error: null,
      url: "",
      customName: "",
      targetPlaylistIds: [],
      completedCount: null,
      setup: null,
    });
  }

  setDownloadUrl(url: string): void {
    // Editar la URL descarta el error inline del intento anterior.
    this.setDownload({ url, error: null });
  }
  setDownloadCustomName(name: string): void {
    this.setDownload({ customName: name });
  }
  toggleDownloadEmbedThumbnail(): void {
    this.setDownload({ embedThumbnail: !this.state.download.embedThumbnail });
  }
  toggleDownloadTarget(playlistId: string): void {
    const current = this.state.download.targetPlaylistIds;
    const next = current.includes(playlistId)
      ? current.filter((x) => x !== playlistId)
      : [...current, playlistId];
    this.setDownload({ targetPlaylistIds: next });
  }

  async runSetup(): Promise<void> {
    this.setDownload({ step: "settingUp", setup: { name: "", pct: 0 }, error: null });
    try {
      await downloader.setupTools((p) => {
        if (p.phase === "tool") {
          this.setDownload({ setup: { name: p.name, pct: p.pct } });
        }
      });
      const status = await downloader.toolsStatus();
      this.setDownload({
        toolsReady: status.ready,
        step: status.ready ? "input" : "error",
        error: status.ready ? null : "No se pudieron instalar los binarios.",
        setup: null,
      });
    } catch (e) {
      this.setDownload({ step: "error", error: messageOf(e), setup: null });
    }
  }

  async probe(): Promise<void> {
    const { url: rawUrl, step } = this.state.download;
    const url = rawUrl.trim();
    if (!url) return;
    // Enter repetido mientras ya se analiza/descarga: ignorar.
    if (step === "probing" || step === "downloading") return;
    this.setDownload({ step: "probing", error: null, completedCount: null });
    try {
      const probe = await downloader.probeUrl(url);
      this.setDownload({
        step: "preview",
        probe,
        customName: probe.isPlaylist ? "" : probe.title,
      });
    } catch (e) {
      // Error inline: la URL queda a la vista para corregirla y reintentar.
      this.setDownload({ step: "input", probe: null, error: messageOf(e) });
    }
  }

  /**
   * Agrega paths a una playlist de CUALQUIER space (destinos de la descarga).
   * Para el space activo delega en `addToPlaylist`; para otros escribe el
   * archivo de la playlist y refleja el cambio en `otherSpaces`.
   */
  private async addToPlaylistAnywhere(id: string, paths: string[]): Promise<void> {
    if (this.state.playlists.some((p) => p.id === id)) {
      await this.addToPlaylist(id, paths);
      return;
    }
    let updated: Playlist | undefined;
    this.set({
      otherSpaces: this.state.otherSpaces.map((g) => ({
        ...g,
        playlists: g.playlists.map((p) => {
          if (p.id !== id) return p;
          updated = { ...p, trackPaths: [...new Set([...p.trackPaths, ...paths])] };
          return updated;
        }),
      })),
    });
    if (updated) await this.persistPlaylist(updated);
  }

  async runDownload(): Promise<void> {
    const { url, customName, embedThumbnail, probe, targetPlaylistIds, step } =
      this.state.download;
    if (!probe || !url.trim() || step !== "preview") return;
    this.setDownload({
      step: "downloading",
      progress: {
        pct: 0,
        index: 1,
        total: probe.count || 1,
        title: probe.isPlaylist ? "" : probe.title,
        converting: false,
        speed: null,
        eta: null,
        updatingTools: null,
      },
      error: null,
    });
    try {
      const relPaths = await downloader.download(
        {
          url,
          customName: customName.trim() ? customName.trim() : null,
          isPlaylist: probe.isPlaylist,
          embedThumbnail,
        },
        (p) => {
          const cur = this.state.download.progress;
          if (!cur) return;
          if (p.phase === "item") {
            this.setDownload({
              progress: {
                ...cur,
                index: p.index,
                total: p.total,
                title: p.title,
                converting: false,
                pct: 0,
                speed: null,
                eta: null,
                updatingTools: null,
              },
            });
          } else if (p.phase === "progress") {
            // yt-dlp manda "Unknown" en los primeros ticks (todavía no tiene
            // muestras para estimar) y "NA" en el último (ya terminó). Ninguno
            // de los dos es algo que quieras leer en pantalla.
            const known = (v: string | null) =>
              v && !v.includes("Unknown") && !/^N\/?A$/.test(v.trim()) ? v : null;
            this.setDownload({
              progress: {
                ...cur,
                pct: p.pct,
                converting: false,
                speed: known(p.speed),
                eta: known(p.eta),
                updatingTools: null,
              },
            });
          } else if (p.phase === "converting") {
            this.setDownload({ progress: { ...cur, converting: true } });
          } else if (p.phase === "updatingTools") {
            // Falló por yt-dlp viejo: el backend lo está actualizando y va a
            // reintentar solo. Avisamos para que el usuario entienda la pausa.
            this.setDownload({
              progress: { ...cur, converting: false, updatingTools: { pct: p.pct } },
            });
          }
        },
      );
      // Reescaneo para que los nuevos MP3 entren a `tracks` con metadata.
      await this.scan();
      // Auto-agregar a las playlists elegidas, del space que sean (deduplica).
      for (const id of targetPlaylistIds) {
        await this.addToPlaylistAnywhere(id, relPaths);
      }
      // Volver al form limpio con el banner de éxito: listo para otro link.
      this.setDownload({
        step: "input",
        url: "",
        probe: null,
        customName: "",
        targetPlaylistIds: [],
        progress: null,
        completedCount: relPaths.length,
      });
    } catch (e) {
      // El preview queda intacto para poder reintentar con "Descargar".
      this.setDownload({ step: "preview", error: messageOf(e), progress: null });
    }
  }

  // ── Tick de posición ──
  private startTick(): void {
    this.tickBaseMs = performance.now();
    this.tickBasePos = this.state.positionSec;
    this.stopTick();
    this.tickTimer = setInterval(() => this.onTick(), TICK_MS);
  }
  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
  private onTick(): void {
    const elapsed = (performance.now() - this.tickBaseMs) / 1000;
    const pos = this.tickBasePos + elapsed;
    const dur = this.state.durationSec;
    if (dur > 0 && pos >= dur) {
      if (this.state.loop) {
        void this.seek(0);
        return;
      }
      void this.next();
      return;
    }
    this.set({ positionSec: pos });
  }
}
