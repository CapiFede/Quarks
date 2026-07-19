import { useEffect, useState } from "react";
import { Icon, Button } from "@quarks/core";
import type { EditorStore } from "../store";
import { useEditorState } from "../hooks/useEditorStore";
import type { SongRef } from "../types";

export interface PickerProps {
  store: EditorStore;
}

/** Selector de fuente: una canción de Música o un archivo importado. */
export function Picker({ store }: PickerProps) {
  const { songs, songsLoaded, status, error } = useEditorState(store);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!songsLoaded) void store.loadSongs();
  }, [store, songsLoaded]);

  const filtered = query.trim()
    ? songs.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
    : songs;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--q-text-primary)" }}>
          Elegí qué editar
        </h2>
        <div style={{ flex: 1 }} />
        <Button icon="folder_open" variant="soft" onClick={() => void store.importExternal()}>
          Importar archivo…
        </Button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 10px",
          marginBottom: 10,
          background: "var(--q-surface-alt)",
          border: "1px solid var(--q-border)",
          borderRadius: 8,
        }}
      >
        <Icon name="search" size={16} color="var(--q-text-light)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar canción…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--q-text-primary)",
            fontSize: 13,
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {status === "loadingSongs" && songs.length === 0 ? (
          <Empty icon="hourglass_empty" text="Cargando…" />
        ) : error ? (
          <Empty icon="error" text={error} />
        ) : filtered.length === 0 ? (
          <Empty
            icon="music_off"
            text={
              songs.length === 0
                ? "No hay canciones en Música. Importá un archivo para editar."
                : "Sin resultados."
            }
          />
        ) : (
          filtered.map((song) => <SongRow key={song.path} song={song} onClick={() => void store.openSong(song)} />)
        )}
      </div>
    </div>
  );
}

function SongRow({ song, onClick }: { song: SongRef; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        height: 40,
        padding: "0 10px",
        borderRadius: 8,
        cursor: "default",
        background: hover ? "var(--q-card-hover)" : "transparent",
      }}
    >
      <Icon name="music_note" size={18} color="var(--q-text-secondary)" />
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: "var(--q-text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {song.name}
      </span>
      <span style={{ fontSize: 11, color: "var(--q-text-light)", textTransform: "uppercase" }}>
        {song.ext}
      </span>
      {hover && <Icon name="content_cut" size={16} color="var(--q-primary-light)" />}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        height: "100%",
        color: "var(--q-text-light)",
      }}
    >
      <Icon name={icon} size={28} color="var(--q-text-light)" />
      <span style={{ fontSize: 12.5, textAlign: "center", maxWidth: 320 }}>{text}</span>
    </div>
  );
}
