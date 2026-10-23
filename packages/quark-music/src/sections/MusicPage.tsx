import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { TextInput, Button, Icon, IconButton, isAndroid, useStoreState } from "@quarks/core";
import type { Track } from "../types";
import type { MusicStore } from "../store";
import { resolveQueue, filterTracks, groupPlaylists } from "../store";
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
  const state = useStoreState(store);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // El panel sigue al track que empieza a sonar (auto-avance, siguiente/anterior),
  // igual que la lista scrollea hasta él. Si se detiene (`activePath` en null)
  // queda la selección que había.
  useEffect(() => {
    if (state.activePath) setSelectedPath(state.activePath);
  }, [state.activePath]);

  const queue = useMemo(
    () => resolveQueue(state),
    [state.view, state.category, state.tracks, state.playlists, state.sort, state.ratings],
  );
  const visible = useMemo(() => filterTracks(queue, state.search), [queue, state.search]);

  const activeTrack = useMemo(
    () => state.tracks.find((t) => t.path === state.activePath) ?? null,
    [state.tracks, state.activePath],
  );
  const selectedTrack = useMemo(
    () => state.tracks.find((t) => t.path === selectedPath) ?? activeTrack,
    [state.tracks, selectedPath, activeTrack],
  );

  // Playlists agrupadas por categoría, para los chips del trackpanel y de la descarga.
  const groups = useMemo(
    () => groupPlaylists(state.playlists, state.categories),
    [state.playlists, state.categories],
  );

  // Callbacks estables para que el `memo` de TrackList/TrackPanel corte los
  // re-renders del tick (la página se renderiza cada 250 ms mientras suena).
  // `store` y `setSelectedPath` son estables; los que usan el track
  // seleccionado cambian solo con él (y el panel se re-renderiza igual ahí).
  const onPlay = useCallback((p: string) => void store.play(p), [store]);
  const onEdit = useCallback((t: Track) => void store.openTrim(t), [store]);
  const onRate = useCallback(
    (score: number | null) => {
      if (selectedTrack) store.setRating(selectedTrack.path, score);
    },
    [store, selectedTrack],
  );
  const onToggleInPlaylist = useCallback(
    (id: string, isIn: boolean) => {
      if (!selectedTrack) return;
      void store.toggleInPlaylist(id, selectedTrack.path, isIn);
    },
    [store, selectedTrack],
  );
  const onRename = useCallback(
    async (path: string, name: string) => {
      await store.renameTrack(path, name);
      // El path puede haber cambiado: limpiar selección para que el panel
      // muestre el track renombrado (lo encuentra por activePath o por
      // la nueva selección del usuario).
      setSelectedPath(null);
    },
    [store],
  );
  const onDelete = useCallback(
    async (path: string) => {
      await store.deleteTrack(path);
      setSelectedPath(null);
    },
    [store],
  );

  // ── Biblioteca vacía / escaneando: estado a pantalla completa ──
  // (la toolbar sigue visible: la renderiza el Shell, no la página)
  if (state.tracks.length === 0) {
    if (state.status === "scanning") {
      return (
        <>
          <DownloadDialog store={store} groups={groups} />
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
        <DownloadDialog store={store} groups={groups} />
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
      <DownloadDialog store={store} groups={groups} />
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
          ratings={state.ratings}
          plays={state.plays}
          activePath={state.activePath}
          playing={state.playing}
          selectedPath={selectedPath}
          onPlay={onPlay}
          onSelect={setSelectedPath}
          empty={emptyMsg}
        />
        {/* El panel derecho es desktop-only: en el ancho de un celular se comía
            media pantalla. En mobile la lista va a ancho completo y el player
            inferior alcanza para controlar la reproducción. */}
        {!isAndroid && (
          <TrackPanel
            track={selectedTrack}
            plays={selectedTrack ? (state.plays[selectedTrack.path] ?? 0) : 0}
            rating={selectedTrack ? (state.ratings[selectedTrack.path] ?? null) : null}
            onRate={onRate}
            groups={groups}
            onPlay={onPlay}
            onEdit={onEdit}
            onToggleInPlaylist={onToggleInPlaylist}
            onRename={onRename}
            onDelete={onDelete}
          />
        )}
      </div>

      {/* Errores de reproducción / borrar / renombrar con biblioteca cargada
          (la rama vacía de arriba tiene el suyo). Se cierra a mano. */}
      {state.status === "error" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 6px 0 14px",
            borderTop: "1px solid var(--q-border-light)",
            fontSize: 11,
            color: "var(--q-error)",
          }}
        >
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {state.error}
          </span>
          <IconButton name="close" tooltip="Cerrar" size={13} onClick={() => store.dismissError()} />
        </div>
      )}

      <Player
        track={activeTrack}
        playing={state.playing}
        positionSec={state.positionSec}
        durationSec={state.durationSec}
        volume={state.volume}
        order={state.order}
        loop={state.loop}
        onTogglePlay={() => void store.togglePlay()}
        onNext={() => void store.next()}
        onPrev={() => void store.prev()}
        onSeek={(s) => void store.seek(s)}
        onSetOrder={(o) => store.setOrder(o)}
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
