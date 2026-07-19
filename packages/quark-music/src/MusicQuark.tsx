import { Icon, type AiContext, type Quark } from "@quarks/core";
import { MusicStore } from "./store";
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
    name: "Música",
    icon: <Icon name="music_note" size={16} />,

    buildPage: () => <MusicPage store={store} />,
    buildToolbar: () => <MusicToolbar store={store} />,

    onEscape: () => {
      if (store.getSnapshot().searchOpen) {
        store.toggleSearch();
        return true;
      }
      return false;
    },

    buildAiContext: () => buildMusicAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}

/** Vista activa traducida a algo humano para el prompt. */
function viewLabel(view: string, playlistName: string | null): string {
  if (view === "all") return "Toda la biblioteca";
  if (view === "unassigned") return "Sin asignar a playlist";
  return playlistName ? `Playlist "${playlistName}"` : `Playlist ${view}`;
}

/**
 * Snapshot del state de Música para Quarky.
 *   - `instructions`: vista activa, playlist, track sonando, estado del player.
 *   - Sin attachments: el audio en sí no se inyecta (sería binario).
 */
function buildMusicAiContext(store: MusicStore): AiContext | null {
  const s = store.getSnapshot();
  if (s.status === "idle" || s.status === "loading") return null;

  const activePlaylist =
    typeof s.view === "string" && s.view !== "all" && s.view !== "unassigned"
      ? s.playlists.find((p) => p.id === s.view) ?? null
      : null;
  const playing = s.activePath ? s.tracks.find((t) => t.path === s.activePath) ?? null : null;

  const lines = [
    "Estás en el quark Música (reproductor + biblioteca local).",
    `Biblioteca: ${s.tracks.length} tracks, ${s.playlists.length} playlists.`,
    `Vista actual: ${viewLabel(String(s.view), activePlaylist?.name ?? null)}.`,
  ];

  if (playing) {
    const mmss = formatDuration(s.positionSec) + " / " + formatDuration(s.durationSec);
    lines.push(
      `Sonando ahora: "${playing.title}"${playing.artist ? ` — ${playing.artist}` : ""} (${mmss}, ${s.playing ? "play" : "pausado"}).`,
    );
  } else {
    lines.push("Sin track sonando.");
  }

  if (s.playlists.length > 0) {
    const names = s.playlists.map((p) => `"${p.name}" (${p.trackPaths.length})`).join(", ");
    lines.push("", `Playlists disponibles: ${names}.`);
  }

  return { instructions: lines.join("\n") };
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
