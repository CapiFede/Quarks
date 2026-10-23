/**
 * Store del music quark: estado + acciones, compartido por la toolbar y la
 * página (que viven en sub-árboles de React separados). Es un store externo
 * (patrón `useSyncExternalStore`, ver §state del plan): el estado vive en la
 * instancia del quark y sobrevive a los cambios de tab; toolbar y página se
 * suscriben y quedan en sync sin un provider común.
 *
 * Persistencia: el ÍNDICE de playlists (id+nombre+categoría+fila) y las categorías
 * viven en `packages/music/index.json`; el CONTENIDO de cada playlist (sus
 * trackPaths) en `packages/music/playlists/<id>.json`; las reproducciones de
 * cada canción en `packages/music/plays.json`, su puntaje en
 * `packages/music/ratings.json`, y los audios en `packages/music/songs/`. El escaneo y la reproducción son comandos Rust
 * (rodio); la posición se trackea acá con un timer.
 */
import {
  readJson,
  writeJson,
  deleteJson,
  isAndroid,
  type LegacySpace,
  ExternalStore,
  messageOf,
  newId,
} from "@quarks/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Track, Playlist, Category, PlaylistView, PlayOrder, TrackSort } from "./types";
import * as library from "./services/library";
import * as mediaSession from "./services/mediaSession";
import * as downloader from "./services/download";
import type { ProbeResult } from "./services/download";
import * as trim from "./services/trim";
import type { WavePeaks } from "./services/trim";
import { CHIPS_PER_ROW, RATING_MAX } from "./util";

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
  /**
   * Qué falta instalar, para que el paso `needsSetup` diga la verdad. En Linux
   * es normal tener ffmpeg del sistema y que solo falte yt-dlp.
   */
  toolsMissing: { ytDlp: boolean; ffmpeg: boolean };
  setup: { name: string; pct: number } | null;
  probe: ProbeResult | null;
  customName: string;
  embedThumbnail: boolean;
  /** Playlists destino. */
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
  /** Audio decodificado: lo reproduce la preview (el mismo que dibuja la onda). */
  audio: AudioBuffer | null;
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

export interface MusicState {
  status: MusicStatus;
  error: string | null;
  /** Todos los tracks escaneados, ordenados por artista/título. */
  tracks: Track[];
  /** Veces que se escuchó cada track (por `Track.path`; ausente = 0). */
  plays: Record<string, number>;
  /** Puntaje de cada track, de 1 a `RATING_MAX` (por `Track.path`; ausente = sin puntaje). */
  ratings: Record<string, number>;

  playlists: Playlist[];
  /** Categorías, en orden. */
  categories: Category[];
  /**
   * Categoría elegida en la toolbar; `null` = la biblioteca (playlists sueltas
   * + las pseudo-vistas). Invariante: si `view` es una playlist, esta es su
   * `categoryId` (el dropdown de playlists solo lista las de la categoría).
   */
  category: string | null;
  /** Vista seleccionada: "all" | "unassigned" | id de playlist. */
  view: PlaylistView;
  /** Orden de la lista y de la cola (ver `TrackSort`). Vale para todas las vistas. */
  sort: TrackSort;

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
  /** Cómo elige el "siguiente" (ver `pickNext`). */
  order: PlayOrder;
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
  audio: null,
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
  plays: {},
  ratings: {},
  playlists: [],
  categories: [],
  category: null,
  view: "all",
  sort: "list",
  searchOpen: false,
  search: "",
  manageOpen: false,
  activePath: null,
  playing: false,
  positionSec: 0,
  durationSec: 0,
  volume: 0.8,
  order: "normal",
  loop: false,
  download: INITIAL_DOWNLOAD,
  trim: INITIAL_TRIM,
};

const TICK_MS = 250;
/** Si quedan más de estos segundos, "anterior" reinicia el track en vez de saltar. */
const PREV_RESTART_SEC = 3;
/** Largo mínimo del rango a conservar en el recorte (segundos). */
const MIN_TRIM_LEN = 0.1;
/**
 * Una escucha cuenta al pasar la mitad del track o los 4 minutos, lo que pase
 * primero (la regla de Last.fm): saltear una canción a los 10 s no la suma.
 */
const PLAY_COUNT_FRACTION = 0.5;
const PLAY_COUNT_MAX_SEC = 240;

/** Id del quark: clave de su sección en los archivos de la época de los Spaces. */
const QUARK_ID = "music";
/** Índice de playlists y categorías. */
const INDEX_KEY = "packages/music/index";
/** Reproducciones por canción. */
const PLAYS_KEY = "packages/music/plays";
/** Puntaje por canción. */
const RATINGS_KEY = "packages/music/ratings";
/** Datos de una playlist: solo trackPaths. */
const playlistKey = (playlistId: string) => `packages/music/playlists/${playlistId}`;

/** Entrada del índice de playlists. */
interface PlaylistRef {
  id: string;
  name: string;
  /** Ausente (o null) = playlist suelta. */
  categoryId?: string | null;
  /** Fila en la grilla de chips (ver `Playlist.row`). */
  row?: number;
}

interface IndexFile {
  playlists: PlaylistRef[];
  categories: Category[];
}

interface PlaysFile {
  /** `Track.path` → veces escuchada. */
  counts: Record<string, number>;
}

interface RatingsFile {
  /** `Track.path` → puntaje (1 a `RATING_MAX`). */
  scores: Record<string, number>;
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

/**
 * Los tracks de `paths`, en ese orden. Nunca repite un track aunque la lista
 * tenga rutas repetidas (data vieja / sync, o el mismo track en dos playlists
 * de una categoría): dedup por ruta. Saltea las rutas que ya no existen.
 */
function tracksAt(paths: string[], tracks: Track[]): Track[] {
  const byPath = new Map(tracks.map((t) => [t.path, t]));
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const p of paths) {
    if (seen.has(p)) continue;
    seen.add(p);
    const t = byPath.get(p);
    if (t) out.push(t);
  }
  return out;
}

/** Los tracks de la vista activa, en su orden propio. */
function viewTracks(state: MusicState): Track[] {
  const { view, tracks, playlists, category } = state;
  if (view === "all") {
    if (!category) return tracks;
    // La categoría como una playlist grande: sus playlists una atrás de otra.
    const inCategory = playlists.filter((p) => p.categoryId === category);
    return tracksAt(inCategory.flatMap((p) => p.trackPaths), tracks);
  }
  if (view === "unassigned") {
    const assigned = new Set(playlists.flatMap((p) => p.trackPaths));
    return tracks.filter((t) => !assigned.has(t.path));
  }
  const pl = playlists.find((p) => p.id === view);
  if (!pl) return tracks;
  return tracksAt(pl.trackPaths, tracks);
}

/** Resuelve la "cola" de la vista activa, en el orden elegido. No aplica el buscador. */
export function resolveQueue(state: MusicState): Track[] {
  return sortView(viewTracks(state), state.sort, state.ratings);
}

/**
 * Cuántos tracks tiene `view` dentro de `category`: lo mismo que mostraría
 * abrirla (una categoría cuenta cada track una vez aunque esté en varias de
 * sus playlists, y no cuenta rutas que ya no existen).
 */
export function viewSize(state: MusicState, category: string | null, view: PlaylistView): number {
  return viewTracks({ ...state, category, view }).length;
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

const byName = (a: Track, b: Track) =>
  a.title.localeCompare(b.title, "es", { sensitivity: "base", numeric: true });

/** Reordena una vista según `sort`; `list` la deja como está. */
function sortView(tracks: Track[], sort: TrackSort, ratings: Record<string, number>): Track[] {
  if (sort === "list") return tracks;
  if (sort === "name") return [...tracks].sort(byName);
  if (sort === "rating") {
    // Sin puntaje cuenta como 0: queda después de cualquier puntaje (mínimo 1).
    const score = (t: Track) => ratings[t.path] ?? 0;
    return [...tracks].sort((a, b) => score(b) - score(a) || byName(a, b));
  }
  const dir = sort === "newest" ? -1 : 1;
  return [...tracks].sort((a, b) => dir * (a.createdMs - b.createdMs) || byName(a, b));
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

/**
 * Índice leído de disco (sin validar) → refs y categorías con forma válida. Una
 * playlist cuya categoría no existe queda suelta.
 */
function parseIndex(raw: unknown): IndexFile {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<IndexFile>;
  const categories = (Array.isArray(r.categories) ? r.categories : [])
    .filter(isValidRef)
    .map(({ id, name }) => ({ id, name }));
  const catIds = new Set(categories.map((c) => c.id));
  const playlists = (Array.isArray(r.playlists) ? r.playlists : [])
    .filter(isValidRef)
    .map((p: PlaylistRef) => ({
      id: p.id,
      name: p.name,
      categoryId: typeof p.categoryId === "string" && catIds.has(p.categoryId) ? p.categoryId : null,
      ...(Number.isInteger(p.row) ? { row: p.row } : {}),
    }));
  return { playlists, categories };
}

/** Conteos leídos de disco (sin validar): solo números positivos. */
function parsePlays(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [path, n] of Object.entries(raw)) {
    if (typeof n === "number" && n > 0) out[path] = Math.floor(n);
  }
  return out;
}

/** Puntajes leídos de disco (sin validar): solo enteros de 1 a `RATING_MAX`. */
function parseRatings(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [path, n] of Object.entries(raw)) {
    if (isRating(n)) out[path] = n;
  }
  return out;
}

function isRating(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= RATING_MAX;
}

/** `map` sin la clave `from`; si se pasa `to`, su valor queda bajo `to`. */
function moveKey(
  map: Record<string, number>,
  from: string,
  to?: string,
): Record<string, number> {
  const { [from]: value, ...rest } = map;
  return to === undefined ? rest : { ...rest, [to]: value };
}

/**
 * Migración única desde los Spaces (ver `Quark.migrateSpaces`): suma las
 * playlists de todos los spaces al índice, con una categoría por space (con
 * su nombre; reusa una existente que se llame igual) para no perder la
 * agrupación. Si había un solo space no hace falta agrupar y quedan como
 * estaban. Lo que ya estaba en el índice, por id, no se toca. Los trackPaths
 * ya vivían aparte, por id, así que no se mueven.
 */
export async function migrateMusicFromSpaces(spaces: LegacySpace[]): Promise<void> {
  const current = parseIndex(await readJson<IndexFile>(INDEX_KEY, { playlists: [], categories: [] }));
  const grouped = spaces.length > 1;
  const playlists: PlaylistRef[] = [...current.playlists];
  const categories: Category[] = [...current.categories];
  const seen = new Set(playlists.map((p) => p.id));
  for (const s of spaces) {
    const index = parseIndex(s.sections[QUARK_ID]);
    for (const c of index.categories) {
      if (!categories.some((x) => x.id === c.id)) categories.push(c);
    }
    const loose = index.playlists.filter((p) => !p.categoryId && !seen.has(p.id));
    let spaceCat: Category | null = null;
    if (grouped && loose.length > 0) {
      spaceCat = categories.find((c) => c.name === s.name) ?? newCategory(s.name);
      if (!categories.includes(spaceCat)) categories.push(spaceCat);
    }
    for (const p of index.playlists) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const categoryId = p.categoryId ?? spaceCat?.id ?? null;
      playlists.push(categoryId ? { id: p.id, name: p.name, categoryId } : { id: p.id, name: p.name });
    }
  }
  await writeJson<IndexFile>(INDEX_KEY, { playlists, categories });
}

/** Grupo de playlists para listar en la UI: las sueltas (`category: null`) o una categoría. */
export interface PlaylistGroup {
  category: Category | null;
  playlists: Playlist[];
}

/** Playlists agrupadas: primero las sueltas, después cada categoría (las vacías no). */
export function groupPlaylists(playlists: Playlist[], categories: Category[]): PlaylistGroup[] {
  const groups: PlaylistGroup[] = [
    { category: null, playlists: playlists.filter((p) => p.categoryId === null) },
    ...categories.map((c) => ({
      category: c,
      playlists: playlists.filter((p) => p.categoryId === c.id),
    })),
  ];
  return groups.filter((g) => g.playlists.length > 0);
}

/**
 * Filas de la grilla de chips del trackpanel para las playlists de un grupo:
 * por `row` y, dentro de cada fila, en el orden del índice. Las sin fila van al
 * final; ninguna fila pasa de `CHIPS_PER_ROW` (lo que sobra sigue abajo).
 */
export function playlistRows(playlists: Playlist[]): Playlist[][] {
  const byRow = new Map<number, Playlist[]>();
  for (const p of playlists) {
    const r = p.row ?? Infinity;
    byRow.set(r, [...(byRow.get(r) ?? []), p]);
  }
  const rows: Playlist[][] = [];
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const ps = byRow.get(r)!;
    for (let i = 0; i < ps.length; i += CHIPS_PER_ROW) rows.push(ps.slice(i, i + CHIPS_PER_ROW));
  }
  return rows;
}

/** Entrada del índice para una playlist (sin `categoryId` si está suelta ni `row` si no tiene fila). */
function toRef({ id, name, categoryId, row }: Playlist): PlaylistRef {
  return { id, name, ...(categoryId ? { categoryId } : {}), ...(row !== undefined ? { row } : {}) };
}

function newCategory(name: string): Category {
  return { id: newId(), name: name.trim() || "Nueva categoría" };
}

/** Mueve la playlist `playlistId` a `categoryId`, al final de su grilla. */
function moveTo(items: Playlist[], playlistId: string, categoryId: string | null): Playlist[] {
  return items.map((p) => (p.id === playlistId ? { ...p, categoryId, row: undefined } : p));
}

/** Deja sueltas las playlists de la categoría `id` (al borrarla), al final de la grilla. */
function release(items: Playlist[], id: string): Playlist[] {
  return items.map((p) => (p.categoryId === id ? { ...p, categoryId: null, row: undefined } : p));
}

function renamed<T extends { id: string; name: string }>(items: T[], id: string, name: string): T[] {
  return items.map((x) => (x.id === id ? { ...x, name } : x));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class MusicStore extends ExternalStore<MusicState> {
  constructor() {
    super(INITIAL);
  }

  // Estado que no requiere re-render (vive fuera del snapshot).
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private tickBaseMs = 0;
  private tickBasePos = 0;
  private history: string[] = [];
  private playedBag = new Set<string>();
  private scanSeq = 0;
  /** Invalida cargas de recorte en curso (cerrar/abrir otro track en el medio). */
  private trimSeq = 0;
  /** Invalida la descarga en curso (cancelada desde `closeDownload`). */
  private downloadSeq = 0;
  /** El índice ya se leyó de disco. Antes de eso no se escribe (lo pisaría vacío). */
  private loaded = false;
  /** La reproducción en curso ya sumó su escucha (ver `maybeCountPlay`). */
  private counted = false;
  // Suscripción a las teclas/controles de media del SO (MPRIS, Linux-only).
  private mediaKeysUnlisten: UnlistenFn | null = null;

  // ── Ciclo de vida (lo llama el Shell) ──
  async init(): Promise<void> {
    await Promise.all([this.scan(), this.loaded ? null : this.loadLibrary()]);
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
    // Sin track activo: el backend quedó sin sink y un `resume` sobre eso es
    // no-op, así que el próximo play tiene que cargar de nuevo.
    this.set({ activePath: null, playing: false, positionSec: 0, durationSec: 0 });
    if (this.mediaKeysUnlisten) {
      this.mediaKeysUnlisten();
      this.mediaKeysUnlisten = null;
    }
    void mediaSession.setPlayback("stopped", 0);
  }

  // ── Índice (playlists + categorías) y reproducciones ──

  /**
   * Lee de disco el índice, los trackPaths de cada playlist, las
   * reproducciones y los puntajes. Una sola vez: después el estado en memoria es la verdad (un
   * pull de Drive recarga la app entera).
   */
  private async loadLibrary(): Promise<void> {
    const [index, plays, ratings] = await Promise.all([
      readJson<IndexFile>(INDEX_KEY, { playlists: [], categories: [] }),
      readJson<PlaysFile>(PLAYS_KEY, { counts: {} }),
      readJson<RatingsFile>(RATINGS_KEY, { scores: {} }),
    ]);
    const { playlists: refs, categories } = parseIndex(index);
    const playlists = await Promise.all(
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
        return { id: ref.id, name: ref.name, categoryId: ref.categoryId ?? null, row: ref.row, trackPaths };
      }),
    );
    this.loaded = true;
    // Si ya hay playlists, arrancamos en la primera (no en "Todas"), dentro de
    // su categoría.
    const first = playlists[0];
    this.set({
      playlists,
      categories,
      plays: parsePlays(plays.counts),
      ratings: parseRatings(ratings.scores),
      category: first?.categoryId ?? null,
      view: first ? first.id : "all",
    });
  }

  // ── Carpeta / escaneo ──
  /** Abre la carpeta fija de canciones en el explorador (para tirar música ahí). */
  async openFolder(): Promise<void> {
    await library.revealFolder();
  }

  async rescan(): Promise<void> {
    await this.scan();
  }

  /** Cierra la línea de error de la página (vuelve a `ready`). */
  dismissError(): void {
    if (this.state.status !== "error") return;
    this.set({ status: "ready", error: null });
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

  /**
   * Cambia la categoría de la toolbar (`null` = biblioteca). Arranca siempre en
   * su "Todas": en una categoría es la unión de sus playlists, lista para
   * reproducir como una playlist grande.
   */
  selectCategory(category: string | null): void {
    if (category === this.state.category) return;
    this.show(category, "all");
  }

  /** Cambia el orden de la lista (menú de la toolbar). */
  setSort(sort: TrackSort): void {
    if (sort === this.state.sort) return;
    this.set({ sort });
  }

  /** Selecciona categoría + vista de una (respeta el invariante de `category`). */
  private show(category: string | null, view: PlaylistView): void {
    if (category === this.state.category && view === this.state.view) return;
    this.playedBag.clear();
    this.set({ category, view });
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
  }
  closeManage(): void {
    this.set({ manageOpen: false });
  }

  // ── Playlists (CRUD: índice + archivo individual) ──

  /** Escribe el índice: categorías + id/nombre/categoría de cada playlist, sin sus tracks. */
  private async persistIndex(): Promise<void> {
    if (!this.loaded) return;
    await writeJson<IndexFile>(INDEX_KEY, {
      playlists: this.state.playlists.map(toRef),
      categories: this.state.categories,
    });
  }

  /** Escribe los trackPaths de una playlist en su archivo propio. */
  private async persistPlaylist(pl: Playlist): Promise<void> {
    await writeJson<PlaylistFile>(playlistKey(pl.id), { trackPaths: pl.trackPaths });
  }

  /**
   * Crea una playlist en `categoryId` (`null` = suelta). Con `open` además la
   * abre: lo hace la toolbar; "Manejar playlists" no cambia la vista.
   */
  async createPlaylist(name: string, categoryId: string | null, open: boolean): Promise<void> {
    if (!this.loaded) return;
    const pl: Playlist = {
      id: newId(),
      name: name.trim() || "Nueva playlist",
      categoryId,
      trackPaths: [],
    };
    this.set({ playlists: [...this.state.playlists, pl] });
    if (open) this.show(categoryId, pl.id);
    await this.persistPlaylist(pl);
    await this.persistIndex();
  }

  async renamePlaylist(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.set({ playlists: renamed(this.state.playlists, id, trimmed) });
    await this.persistIndex();
  }

  /** Abre una playlist desde "Manejar playlists", dentro de su categoría. */
  openPlaylist(playlistId: string): void {
    this.set({ manageOpen: false });
    const pl = this.state.playlists.find((p) => p.id === playlistId);
    if (pl) this.show(pl.categoryId, pl.id);
  }

  /** Como `openPlaylist`, pero entra a una categoría (en su vista "Todas"). */
  openCategory(categoryId: string): void {
    this.set({ manageOpen: false });
    this.selectCategory(categoryId);
  }

  // ── Categorías (agrupan playlists) ──

  /** Crea una categoría. Con `open` además entra a ella (dropdown de la toolbar). */
  async createCategory(name: string, open: boolean): Promise<void> {
    if (!this.loaded) return;
    const cat = newCategory(name);
    this.set({ categories: [...this.state.categories, cat] });
    if (open) this.show(cat.id, "all");
    await this.persistIndex();
  }

  async renameCategory(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.set({ categories: renamed(this.state.categories, id, trimmed) });
    await this.persistIndex();
  }

  /**
   * Borra una categoría. Sus playlists NO se borran: quedan sueltas. Si era la
   * categoría abierta, la toolbar vuelve a la biblioteca (la playlist abierta,
   * ahora suelta, sigue abierta).
   */
  async deleteCategory(id: string): Promise<void> {
    this.set({
      categories: this.state.categories.filter((c) => c.id !== id),
      playlists: release(this.state.playlists, id),
    });
    if (this.state.category === id) this.show(null, this.state.view);
    await this.persistIndex();
  }

  /** Mete una playlist en una categoría (`null` = suelta). */
  async setPlaylistCategory(playlistId: string, categoryId: string | null): Promise<void> {
    this.set({ playlists: moveTo(this.state.playlists, playlistId, categoryId) });
    // Si es la playlist abierta, la toolbar la sigue a su nueva categoría.
    if (this.state.view === playlistId) this.show(categoryId, playlistId);
    await this.persistIndex();
  }

  /**
   * Mueve la playlist `playlistId` en la grilla de chips del trackpanel (las
   * filas de `playlistRows` de su categoría): a la fila `row` antes del chip
   * `index` (el largo de la fila = al final) o, con `index` en `null`, sola a
   * una fila nueva que queda en la posición `row`. A una fila llena no entra.
   * El índice queda en el orden de la grilla, que vale para toda la UI y para
   * la cola de la categoría.
   */
  async movePlaylist(playlistId: string, row: number, index: number | null): Promise<void> {
    const { playlists } = this.state;
    const moved = playlists.find((p) => p.id === playlistId);
    if (!moved) return;
    const group = playlists.filter((p) => p.categoryId === moved.categoryId);
    const rows = playlistRows(group).map((r) => r.map((p) => p.id));
    let from = rows.findIndex((r) => r.includes(playlistId));
    const pos = rows[from].indexOf(playlistId);
    let at = index ?? 0;
    if (index === null) {
      rows.splice(row, 0, []);
      if (from >= row) from++;
    }
    const target = rows[row];
    if (!target) return;
    if (row !== from && target.length >= CHIPS_PER_ROW) return;
    if (row === from && pos < at) at--;
    rows[from].splice(pos, 1);
    target.splice(at, 0, playlistId);

    // Las playlists del grupo vuelven a sus mismos lugares del índice, en el
    // orden de la grilla y con su fila.
    const layout = rows.filter((r) => r.length > 0);
    const rowOf = new Map(layout.flatMap((r, k) => r.map((id) => [id, k] as const)));
    const byId = new Map(group.map((p) => [p.id, p]));
    const order = layout.flat();
    let k = 0;
    const next = playlists.map((p) => {
      if (p.categoryId !== moved.categoryId) return p;
      const q = byId.get(order[k++])!;
      const r = rowOf.get(q.id)!;
      return q.row === r ? q : { ...q, row: r };
    });
    if (next.every((p, i) => p === playlists[i])) return;
    this.set({ playlists: next });
    await this.persistIndex();
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

      const decoded = await trim.decode(await trim.readBytes(abs));
      if (seq !== this.trimSeq) return;
      this.setTrim({
        step: "ready",
        absPath: abs,
        durationSec,
        audio: decoded?.audio ?? null,
        peaks: decoded?.peaks ?? null,
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
    // Sin audio decodificado no hay preview (el diálogo muestra solo la línea de tiempo).
    if (this.state.trim.step !== "ready" || !this.state.trim.audio) return;
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
      this.set({ trim: INITIAL_TRIM });
      await this.scan();
    } catch (e) {
      this.setTrim({ step: "ready", error: messageOf(e) });
    }
  }

  /** Borra una playlist: la saca del índice y borra su archivo de contenido.
   *  Única vía de borrado ("Manejar playlists"). */
  async deletePlaylist(id: string): Promise<void> {
    this.set({
      playlists: this.state.playlists.filter((p) => p.id !== id),
      view: this.state.view === id ? "all" : this.state.view,
    });
    await this.persistIndex();
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

  /** Agrega/quita un track en una playlist (chips del trackpanel). */
  async toggleInPlaylist(playlistId: string, path: string, isIn: boolean): Promise<void> {
    if (isIn) await this.removeFromPlaylist(playlistId, [path]);
    else await this.addToPlaylist(playlistId, [path]);
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

  /**
   * Para la reproducción y la refleja como "stopped" en el SO (evento Stop).
   * Suelta también el track activo: `stop` descarta el sink (en Android, el
   * elemento), y un `resume` después de eso es no-op — el player quedaría en
   * "playing" sobre silencio. Sin track activo, el próximo play carga de nuevo.
   */
  private async stopPlayback(): Promise<void> {
    await library.stop().catch(() => {});
    this.stopTick();
    this.set({ activePath: null, playing: false, positionSec: 0, durationSec: 0 });
    void mediaSession.setPlayback("stopped", 0);
  }

  // ── Player ──
  async play(path: string): Promise<void> {
    await this.playInternal(path, true);
  }

  private async playInternal(path: string, pushHistory: boolean): Promise<void> {
    const track = this.state.tracks.find((t) => t.path === path);
    // Cargar el track puede tardar (en Android hay que leer el archivo entero
    // antes de sonar). Con el timer corriendo, el tick seguiría viendo el fin
    // del track anterior y dispararía un "siguiente" atrás de otro: dos cargas
    // solapadas sobre el mismo elemento de audio. Lo reanuda el play exitoso.
    this.stopTick();
    try {
      await library.play(path, this.state.volume);
    } catch (e) {
      // Que UI y backend coincidan: en desktop el sink anterior sigue sonando
      // si falló armar el nuevo, así que lo paramos; y sin track activo el
      // play no cae en un `resume` sobre nada.
      await library.stop().catch(() => {});
      this.set({
        activePath: null,
        playing: false,
        positionSec: 0,
        durationSec: 0,
        status: "error",
        error: messageOf(e),
      });
      void mediaSession.setPlayback("stopped", 0);
      return;
    }
    if (pushHistory && this.state.activePath && this.state.activePath !== path) {
      this.history.push(this.state.activePath);
    }
    this.playedBag.add(path);
    this.counted = false;
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
      // Sin track activo: arranca la cola visible (según el orden elegido).
      const q = resolveQueue(this.state);
      if (q.length > 0) await this.play(this.pickNext(q, null));
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
    await this.play(this.pickNext(q, this.state.activePath));
  }

  /**
   * Elige qué suena después de `cur` (o con qué arrancar, si es `null`) según
   * `order`. Salvo en orden normal, no repite un track hasta pasar por toda la
   * cola (`playedBag`). En los modos por reproducciones gana el de menos/más
   * escuchas; como los conteos suben al escuchar, la cola se va recorriendo
   * de a "niveles". En `topRated` gana el de más puntaje entre los que faltan,
   * así que baja de a un puntaje por vez. Los empates se sortean.
   */
  private pickNext(q: Track[], cur: string | null): string {
    const { order, plays, ratings } = this.state;
    if (order === "normal") {
      const idx = cur ? q.findIndex((t) => t.path === cur) : -1;
      return q[(idx + 1) % q.length].path;
    }
    let pool = q.filter((t) => t.path !== cur && !this.playedBag.has(t.path));
    if (pool.length === 0) {
      this.playedBag.clear();
      pool = q.filter((t) => t.path !== cur);
    }
    if (pool.length === 0) pool = q;
    if (order !== "shuffle") {
      // Gana el puntaje más alto de `score` (sin puntaje / sin escuchas = 0).
      const score = (t: Track) =>
        order === "topRated"
          ? (ratings[t.path] ?? 0)
          : order === "leastPlayed"
            ? -(plays[t.path] ?? 0)
            : (plays[t.path] ?? 0);
      const best = Math.max(...pool.map(score));
      pool = pool.filter((t) => score(t) === best);
    }
    return pool[Math.floor(Math.random() * pool.length)].path;
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

  /** Cambia cómo se elige el "siguiente" (botón de orden del player). */
  setOrder(order: PlayOrder): void {
    if (order === this.state.order) return;
    this.playedBag.clear();
    this.set({ order });
  }

  /**
   * Acceso rápido de la toolbar: deja elegido el orden y arranca a reproducir
   * la vista actual desde el track que ese orden elige primero.
   */
  async playViewIn(order: PlayOrder): Promise<void> {
    this.setOrder(order);
    this.playedBag.clear();
    const q = resolveQueue(this.state);
    if (q.length === 0) return;
    await this.play(this.pickNext(q, null));
  }

  // ── Reproducciones ──

  /**
   * Suma una escucha al track que suena cuando su posición pasa el umbral
   * (`PLAY_COUNT_*`). Una vez por reproducción: `counted` se resetea al
   * arrancar un track y al volver a empezar por el repeat.
   */
  private maybeCountPlay(positionSec: number): void {
    const path = this.state.activePath;
    if (this.counted || !path) return;
    const dur = this.state.durationSec;
    const threshold =
      dur > 0 ? Math.min(dur * PLAY_COUNT_FRACTION, PLAY_COUNT_MAX_SEC) : PLAY_COUNT_MAX_SEC;
    if (positionSec < threshold) return;
    this.counted = true;
    this.setPlays({ ...this.state.plays, [path]: (this.state.plays[path] ?? 0) + 1 });
  }

  private setPlays(plays: Record<string, number>): void {
    this.set({ plays });
    if (this.loaded) void writeJson<PlaysFile>(PLAYS_KEY, { counts: plays }).catch(() => {});
  }

  // ── Puntaje ──

  /** Pone el puntaje (1 a `RATING_MAX`) de un track; `null` se lo saca. */
  setRating(path: string, score: number | null): void {
    if (score === null) {
      if (path in this.state.ratings) this.setRatings(moveKey(this.state.ratings, path));
    } else if (isRating(score) && this.state.ratings[path] !== score) {
      this.setRatings({ ...this.state.ratings, [path]: score });
    }
  }

  private setRatings(ratings: Record<string, number>): void {
    this.set({ ratings });
    if (this.loaded) void writeJson<RatingsFile>(RATINGS_KEY, { scores: ratings }).catch(() => {});
  }
  toggleLoop(): void {
    this.set({ loop: !this.state.loop });
  }

  // ── Edición de tracks (borrar / renombrar) ──

  /**
   * Borra el archivo del track del disco. Rust actualiza también todos los
   * `playlists/*.json` que lo referencian; acá actualizamos el estado en
   * memoria (tracks, playlists, reproducciones y puntaje) y limpiamos el player si el
   * track activo era el borrado.
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
    if (path in this.state.plays) this.setPlays(moveKey(this.state.plays, path));
    if (path in this.state.ratings) this.setRatings(moveKey(this.state.ratings, path));
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
   * el path viejo → nuevo en las playlists, las reproducciones, el puntaje y
   * el player.
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
    if (path in this.state.plays) this.setPlays(moveKey(this.state.plays, path, newPath));
    if (path in this.state.ratings) {
      this.setRatings(moveKey(this.state.ratings, path, newPath));
    }
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
    try {
      const status = await downloader.toolsStatus();
      this.setDownload({
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
    // Cerrar con una descarga en curso la cancela: el backend mata yt-dlp y la
    // promesa de `runDownload` rechaza. El bump de `downloadSeq` hace que ese
    // rechazo se ignore en vez de mostrarse como error.
    if (this.state.download.step === "downloading") {
      ++this.downloadSeq;
      void downloader.cancelDownload().catch(() => {});
    }
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

  async runDownload(): Promise<void> {
    const { url, customName, embedThumbnail, probe, targetPlaylistIds, step } =
      this.state.download;
    if (!probe || !url.trim() || step !== "preview") return;
    const seq = ++this.downloadSeq;
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
          // Progreso rezagado de una descarga cancelada: no pisa a la siguiente.
          if (seq !== this.downloadSeq) return;
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
      // Auto-agregar a las playlists elegidas (deduplica).
      for (const id of targetPlaylistIds) {
        await this.addToPlaylist(id, relPaths);
      }
      // Si el diálogo se cerró justo cuando terminaba, no hay form que limpiar
      // (los archivos ya están: por eso el scan y las playlists van igual).
      if (seq !== this.downloadSeq) return;
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
      // Cancelada desde `closeDownload`: el rechazo es el esperado, no un error.
      if (seq !== this.downloadSeq) return;
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
    if (isAndroid) {
      this.onTickNative();
      return;
    }
    const elapsed = (performance.now() - this.tickBaseMs) / 1000;
    const pos = this.tickBasePos + elapsed;
    const dur = this.state.durationSec;
    if (dur > 0 && pos >= dur) {
      // Cortar el timer antes de encadenar: `next()` es async y hasta que el
      // track nuevo cargue la posición sigue pasada de largo, así que el
      // próximo tick volvería a entrar acá. Lo reanuda `playInternal`.
      this.stopTick();
      if (this.state.loop) {
        void this.seekAndResume(0);
        return;
      }
      void this.next();
      return;
    }
    this.maybeCountPlay(pos);
    this.set({ positionSec: pos });
  }

  /**
   * Tick cuando reproduce el WebView (Android): la posición y el fin de track
   * salen del `<audio>` mismo, no de un reloj de pared contra la duración de
   * los tags. Los tags mienten seguido (VBR, archivos recortados) y estimar el
   * final de menos dispara el "siguiente" con el track anterior todavía
   * cargando.
   */
  private onTickNative(): void {
    const st = library.nativeStatus();
    if (!st || st.loading) return;
    if (st.failed) {
      // El elemento no pudo cargar/decodificar: no va a sonar nunca. Mejor
      // decirlo que dejar la barra avanzando sobre un silencio.
      this.stopTick();
      this.set({ playing: false, status: "error", error: "No se pudo reproducir el archivo." });
      this.pushMprisPlayback();
      return;
    }
    if (st.ended) {
      this.stopTick();
      if (this.state.loop) {
        void this.seekAndResume(0);
        return;
      }
      void this.next();
      return;
    }
    this.maybeCountPlay(st.positionSec);
    const patch: Partial<MusicState> = { positionSec: st.positionSec };
    // La duración decodificada le gana a la de los tags para la barra de seek.
    if (st.durationSec > 0 && Math.abs(st.durationSec - this.state.durationSec) > 1) {
      patch.durationSec = st.durationSec;
    }
    this.set(patch);
  }

  /**
   * Salta a `sec` y vuelve a arrancar. Es lo que necesita el repeat: al llegar
   * al final el reproductor quedó pausado (y con el timer cortado), así que un
   * `seek` solo dejaría el track quieto en el segundo 0.
   */
  private async seekAndResume(sec: number): Promise<void> {
    // Volver a empezar por el repeat es otra escucha.
    this.counted = false;
    await this.seek(sec);
    if (!this.state.playing) return;
    await library.resume().catch(() => {});
    this.startTick();
    this.pushMprisPlayback();
  }
}
