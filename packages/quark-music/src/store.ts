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
import { readJson, writeJson, readSpaceSection, writeSpaceSection } from "@quarks/core";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { Track, Playlist, PlaylistView } from "./types";
import * as library from "./services/library";
import * as mediaSession from "./services/mediaSession";
import * as downloader from "./services/download";
import type { ProbeResult } from "./services/download";

export type MusicStatus = "idle" | "loading" | "scanning" | "ready" | "error";

/**
 * Paso del diálogo de descarga. Aislado en `MusicState.download` para que los
 * cambios frecuentes (progreso) no requieran lecturas de otros campos.
 */
export type DownloadStep =
  | "idle"
  | "needsSetup"
  | "settingUp"
  | "input"
  | "probing"
  | "preview"
  | "downloading"
  | "done"
  | "error";

export interface DownloadState {
  open: boolean;
  step: DownloadStep;
  url: string;
  toolsReady: boolean;
  setup: { name: string; pct: number } | null;
  probe: ProbeResult | null;
  customName: string;
  normalize: boolean;
  embedThumbnail: boolean;
  targetPlaylistIds: string[];
  progress: {
    pct: number;
    index: number;
    total: number;
    title: string;
    converting: boolean;
  } | null;
  resultPaths: string[];
  error: string | null;
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
  /** Vista seleccionada: "all" | "unassigned" | id de playlist. */
  view: PlaylistView;

  searchOpen: boolean;
  search: string;

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
}

const INITIAL_DOWNLOAD: DownloadState = {
  open: false,
  step: "idle",
  url: "",
  toolsReady: false,
  setup: null,
  probe: null,
  customName: "",
  normalize: true,
  embedThumbnail: true,
  targetPlaylistIds: [],
  progress: null,
  resultPaths: [],
  error: null,
};

const INITIAL: MusicState = {
  status: "idle",
  error: null,
  tracks: [],
  spaceId: null,
  playlists: [],
  view: "all",
  searchOpen: false,
  search: "",
  activePath: null,
  playing: false,
  positionSec: 0,
  durationSec: 0,
  volume: 0.8,
  shuffle: false,
  loop: false,
  download: INITIAL_DOWNLOAD,
};

const TICK_MS = 250;
/** Si quedan más de estos segundos, "anterior" reinicia el track en vez de saltar. */
const PREV_RESTART_SEC = 3;

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
    const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { playlists: [] });
    if (seq !== this.spaceSeq) return;
    const refs = section.playlists.filter(isValidRef);
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
        return { id: ref.id, name: ref.name, trackPaths };
      }),
    );
    if (seq !== this.spaceSeq) return;
    // Si el space ya tiene playlists, arrancamos en la primera (no en "Todas").
    this.set({ playlists, view: playlists.length > 0 ? playlists[0].id : "all" });
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

  async renamePlaylist(id: string, name: string): Promise<void> {
    this.set({
      playlists: this.state.playlists.map((p) =>
        p.id === id ? { ...p, name: name.trim() || p.name } : p,
      ),
    });
    await this.persistSpaceIndex();
  }

  async deletePlaylist(id: string): Promise<void> {
    this.set({
      playlists: this.state.playlists.filter((p) => p.id !== id),
      view: this.state.view === id ? "all" : this.state.view,
    });
    await this.persistSpaceIndex();
    // El archivo de la playlist queda huérfano (sin referencias desde ningún space).
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
      resultPaths: [],
      error: null,
    });
    try {
      const status = await downloader.toolsStatus();
      this.setDownload({
        toolsReady: status.ready,
        step: status.ready ? "input" : "needsSetup",
      });
    } catch (e) {
      this.setDownload({ step: "error", error: messageOf(e) });
    }
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
      resultPaths: [],
      setup: null,
    });
  }

  setDownloadUrl(url: string): void {
    this.setDownload({ url });
  }
  setDownloadCustomName(name: string): void {
    this.setDownload({ customName: name });
  }
  toggleDownloadNormalize(): void {
    this.setDownload({ normalize: !this.state.download.normalize });
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
    const url = this.state.download.url.trim();
    if (!url) return;
    this.setDownload({ step: "probing", error: null });
    try {
      const probe = await downloader.probeUrl(url);
      this.setDownload({
        step: "preview",
        probe,
        customName: probe.isPlaylist ? "" : probe.title,
      });
    } catch (e) {
      this.setDownload({ step: "error", error: messageOf(e) });
    }
  }

  async runDownload(): Promise<void> {
    const { url, customName, normalize, embedThumbnail, probe, targetPlaylistIds } =
      this.state.download;
    if (!probe || !url.trim()) return;
    this.setDownload({
      step: "downloading",
      progress: {
        pct: 0,
        index: 1,
        total: probe.count || 1,
        title: probe.isPlaylist ? "" : probe.title,
        converting: false,
      },
      error: null,
      resultPaths: [],
    });
    try {
      const relPaths = await downloader.download(
        {
          url,
          customName: customName.trim() ? customName.trim() : null,
          normalize,
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
              },
            });
          } else if (p.phase === "progress") {
            this.setDownload({ progress: { ...cur, pct: p.pct, converting: false } });
          } else if (p.phase === "converting") {
            this.setDownload({ progress: { ...cur, converting: true } });
          }
        },
      );
      // Reescaneo para que los nuevos MP3 entren a `tracks` con metadata.
      await this.scan();
      // Auto-agregar a las playlists elegidas (addToPlaylist deduplica).
      for (const id of targetPlaylistIds) {
        await this.addToPlaylist(id, relPaths);
      }
      this.setDownload({
        step: "done",
        resultPaths: relPaths,
        progress: null,
      });
    } catch (e) {
      this.setDownload({ step: "error", error: messageOf(e), progress: null });
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
