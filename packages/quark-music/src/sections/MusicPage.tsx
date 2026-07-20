import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TextInput, Button, Icon, useActiveSpace, isAndroid } from "@quarks/core";
import type { MusicStore, SpacePlaylists } from "../store";
import { resolveQueue, filterTracks } from "../store";
import { useMusicState } from "../hooks/useMusicStore";
import { TrackList } from "./TrackList";
import { TrackPanel } from "./TrackPanel";
import { Player } from "./Player";
import { DownloadDialog } from "./DownloadDialog";
import { ManagePlaylists } from "./ManagePlaylists";
import { TrimDialog } from "./TrimDialog";

export interface MusicPageProps {
  store: MusicStore;
}

/** Pantalla única del music quark: search drawer + lista + panel + player. */
export function MusicPage({ store }: MusicPageProps) {
  const state = useMusicState(store);
  const space = useActiveSpace();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // El space activo (core) particiona las playlists: cargalas al montar y al
  // cambiar de space. Tracks/carpeta son globales y los carga `initialize()`.
  useEffect(() => {
    void store.setSpace(space.id);
  }, [store, space.id]);

  const queue = useMemo(() => resolveQueue(state), [state.view, state.tracks, state.playlists]);
  const visible = useMemo(() => filterTracks(queue, state.search), [queue, state.search]);

  const activeTrack = useMemo(
    () => state.tracks.find((t) => t.path === state.activePath) ?? null,
    [state.tracks, state.activePath],
  );
  const selectedTrack = useMemo(
    () => state.tracks.find((t) => t.path === selectedPath) ?? activeTrack,
    [state.tracks, selectedPath, activeTrack],
  );

  // Playlists de TODOS los spaces para el trackpanel: el activo primero (desde
  // el estado vivo del store), después el resto (cargado por refreshOtherSpaces).
  const spaceGroups = useMemo<SpacePlaylists[]>(
    () => [
      { spaceId: space.id, spaceName: space.name, color: space.color, playlists: state.playlists },
      ...state.otherSpaces,
    ],
    [space.id, space.name, space.color, state.playlists, state.otherSpaces],
  );

  // ── Biblioteca vacía / escaneando: estado a pantalla completa ──
  // (la toolbar sigue visible: la renderiza el Shell, no la página)
  if (state.tracks.length === 0) {
    if (state.status === "scanning") {
      return (
        <>
          <DownloadDialog store={store} spaceGroups={spaceGroups} />
          <ManagePlaylists store={store} />
          <Centered>
            <Icon name="sync" size={40} color="var(--q-text-light)" />
            <div style={{ fontSize: 13, color: "var(--q-text-secondary)" }}>
              Escaneando tu carpeta de música…
            </div>
          </Centered>
        </>
      );
    }
    return (
      <>
        <DownloadDialog store={store} spaceGroups={spaceGroups} />
        <ManagePlaylists store={store} />
        <Centered>
          <Icon name="folder_open" size={48} color="var(--q-text-light)" />
          <div style={{ fontSize: 15, color: "var(--q-text-secondary)" }}>
            Tu carpeta de música está vacía.
          </div>
          <div style={{ fontSize: 12, color: "var(--q-text-light)", marginTop: -8 }}>
            Tirá tus canciones en la carpeta y reescaneá.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* "Abrir carpeta" y "Descargar" son desktop-only: en Android la
                carpeta de la app es sandbox privado (no hay explorador) y la
                descarga depende de yt-dlp + ffmpeg que no existen en mobile. */}
            {!isAndroid && (
              <>
                <Button variant="filled" icon="folder_open" onClick={() => void store.openFolder()}>
                  Abrir carpeta
                </Button>
                <Button variant="outlined" icon="download" onClick={() => void store.openDownload()}>
                  Descargar
                </Button>
              </>
            )}
            <Button variant="outlined" icon="sync" onClick={() => void store.rescan()}>
              Reescanear
            </Button>
          </div>
          {state.status === "error" && (
            <div style={{ fontSize: 11, color: "var(--q-error)" }}>{state.error}</div>
          )}
        </Centered>
      </>
    );
  }

  const emptyMsg = state.search
    ? "Sin resultados para la búsqueda."
    : "No hay tracks en esta vista.";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--q-background)" }}>
      <DownloadDialog store={store} spaceGroups={spaceGroups} />
      <ManagePlaylists store={store} />
      <TrimDialog store={store} />
      {state.searchOpen && (
        <div style={{ padding: "8px 12px", background: "var(--q-background)", borderBottom: "1px solid var(--q-border)" }}>
          <TextInput
            value={state.search}
            onChange={(v) => store.setSearch(v)}
            placeholder="Buscar canciones…"
            icon="search"
            autoFocus
          />
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <TrackList
          tracks={visible}
          activePath={state.activePath}
          playing={state.playing}
          selectedPath={selectedPath}
          onPlay={(p) => void store.play(p)}
          onSelect={setSelectedPath}
          empty={emptyMsg}
        />
        <TrackPanel
          track={selectedTrack}
          spaceGroups={spaceGroups}
          onPlay={(p) => void store.play(p)}
          onEdit={(t) => void store.openTrim(t)}
          onToggleInPlaylist={(spaceId, id, isIn) => {
            if (!selectedTrack) return;
            void store.toggleInPlaylist(spaceId, id, selectedTrack.path, isIn);
          }}
          onRename={async (path, name) => {
            await store.renameTrack(path, name);
            // El path puede haber cambiado: limpiar selección para que el panel
            // muestre el track renombrado (lo encuentra por activePath o por
            // la nueva selección del usuario).
            setSelectedPath(null);
          }}
          onDelete={async (path) => {
            await store.deleteTrack(path);
            setSelectedPath(null);
          }}
        />
      </div>

      <Player
        track={activeTrack}
        playing={state.playing}
        positionSec={state.positionSec}
        durationSec={state.durationSec}
        volume={state.volume}
        shuffle={state.shuffle}
        loop={state.loop}
        onTogglePlay={() => void store.togglePlay()}
        onNext={() => void store.next()}
        onPrev={() => void store.prev()}
        onSeek={(s) => void store.seek(s)}
        onToggleShuffle={() => store.toggleShuffle()}
        onToggleLoop={() => store.toggleLoop()}
        onSetVolume={(v) => void store.setVolume(v)}
      />
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "var(--q-background)",
      }}
    >
      {children}
    </div>
  );
}
