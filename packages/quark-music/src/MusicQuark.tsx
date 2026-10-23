import type { AiContext, Quark } from "@quarks/core";
import { MusicStore, migrateMusicFromSpaces } from "./store";
import { PLAY_ORDERS } from "./util";
import { MusicPage } from "./sections/MusicPage";
import { MusicToolbar } from "./sections/MusicToolbar";

/**
 * Implementación del contrato `Quark` para Música. Posee un `MusicStore` propio
 * que comparten su página y su toolbar (ver `store.ts`). El Shell llama a
 * `initialize()` al abrir el tab y `dispose()` al cerrarlo.
 */
export function createMusicQuark(): Quark {
  const store = new MusicStore();

  return {
    id: "music",

    buildPage: () => <MusicPage store={store} />,
    buildToolbar: () => <MusicToolbar store={store} />,

    onEscape: () => {
      const s = store.getSnapshot();
      if (s.trim.open) {
        // Durante el export no se cierra (closeTrim lo ignora), pero el Escape
        // igual queda consumido: no debe caer al comportamiento del Shell.
        store.closeTrim();
        return true;
      }
      if (s.manageOpen) {
        store.closeManage();
        return true;
      }
      if (s.searchOpen) {
        store.toggleSearch();
        return true;
      }
      return false;
    },

    buildAiContext: () => buildMusicAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
    migrateSpaces: migrateMusicFromSpaces,
  };
}

/** Vista activa traducida a algo humano para el prompt. */
function viewLabel(view: string, playlistName: string | null, categoryName: string | null): string {
  if (view === "all") {
    return categoryName
      ? `Categoría "${categoryName}" (todas sus playlists juntas)`
      : "Toda la biblioteca";
  }
  if (view === "unassigned") return "Sin asignar a playlist";
  const pl = playlistName ? `Playlist "${playlistName}"` : `Playlist ${view}`;
  return categoryName ? `${pl}, de la categoría "${categoryName}"` : pl;
}

/**
 * Snapshot del state de Música para Quarky.
 *   - `instructions`: vista activa, playlist, track sonando, estado del player,
 *     orden de reproducción y las canciones más escuchadas.
 *   - Sin attachments: el audio en sí no se inyecta (sería binario).
 */
function buildMusicAiContext(store: MusicStore): AiContext | null {
  const s = store.getSnapshot();
  if (s.status === "idle" || s.status === "loading") return null;

  const activePlaylist =
    typeof s.view === "string" && s.view !== "all" && s.view !== "unassigned"
      ? s.playlists.find((p) => p.id === s.view) ?? null
      : null;
  const category = s.categories.find((c) => c.id === s.category) ?? null;
  const playing = s.activePath ? s.tracks.find((t) => t.path === s.activePath) ?? null : null;

  const lines = [
    "Estás en el quark Música (reproductor + biblioteca local).",
    `Biblioteca: ${s.tracks.length} tracks, ${s.playlists.length} playlists.`,
    `Vista actual: ${viewLabel(String(s.view), activePlaylist?.name ?? null, category?.name ?? null)}.`,
  ];

  if (playing) {
    const mmss = formatDuration(s.positionSec) + " / " + formatDuration(s.durationSec);
    lines.push(
      `Sonando ahora: "${playing.title}"${playing.artist ? ` — ${playing.artist}` : ""} (${mmss}, ${s.playing ? "play" : "pausado"}).`,
    );
  } else {
    lines.push("Sin track sonando.");
  }
  const order = PLAY_ORDERS.find((o) => o.id === s.order);
  if (order) lines.push(`Orden de reproducción: ${order.label}.`);

  if (s.playlists.length > 0) {
    const names = s.playlists.map((p) => `"${p.name}" (${p.trackPaths.length})`).join(", ");
    lines.push("", `Playlists disponibles: ${names}.`);
  }

  if (s.categories.length > 0) {
    const cats = s.categories
      .map((c) => {
        const inCat = s.playlists.filter((p) => p.categoryId === c.id).map((p) => `"${p.name}"`);
        return `"${c.name}" (${inCat.length > 0 ? inCat.join(", ") : "vacía"})`;
      })
      .join(", ");
    lines.push(`Categorías de playlists: ${cats}.`);
  }

  const top = s.tracks
    .filter((t) => (s.plays[t.path] ?? 0) > 0)
    .sort((a, b) => (s.plays[b.path] ?? 0) - (s.plays[a.path] ?? 0))
    .slice(0, 5)
    .map((t) => `"${t.title}" (${s.plays[t.path]})`);
  if (top.length > 0) lines.push(`Más escuchadas (reproducciones): ${top.join(", ")}.`);

  const best = s.tracks
    .filter((t) => s.ratings[t.path] !== undefined)
    .sort((a, b) => s.ratings[b.path] - s.ratings[a.path])
    .slice(0, 5)
    .map((t) => `"${t.title}" (${s.ratings[t.path]})`);
  if (best.length > 0) lines.push(`Mejor puntuadas (de 1 a 10): ${best.join(", ")}.`);

  return { instructions: lines.join("\n") };
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
