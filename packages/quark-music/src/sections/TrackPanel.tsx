import { memo, useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Icon, Button } from "@quarks/core";
import type { Track } from "../types";
import type { SpacePlaylists } from "../store";
import { fmtTime } from "../util";
import * as library from "../services/library";

export interface TrackPanelProps {
  track: Track | null;
  /** Playlists de todos los spaces, el activo primero. */
  spaceGroups: SpacePlaylists[];
  onPlay: (path: string) => void;
  /** Abre el diálogo de recorte (trim) con esta canción. */
  onEdit: (track: Track) => void;
  onToggleInPlaylist: (spaceId: string, playlistId: string, isIn: boolean) => void;
  onRename: (path: string, newName: string) => Promise<void> | void;
  onDelete: (path: string) => Promise<void> | void;
}

/** Panel lateral derecho (260px): cover editable, título editable, metadata,
 * pertenencia a playlists (todos los spaces, agrupado) y acciones (borrar). */
export const TrackPanel = memo(function TrackPanel({
  track,
  spaceGroups,
  onPlay,
  onEdit,
  onToggleInPlaylist,
  onRename,
  onDelete,
}: TrackPanelProps) {
  return (
    <div
      style={{
        width: 260,
        flex: "0 0 260px",
        background: "var(--q-surface)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <Cover track={track} />

      {track ? (
        <>
          <EditableTitle
            key={track.path}
            track={track}
            onRename={(name) => onRename(track.path, name)}
          />

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              columnGap: 10,
              rowGap: 5,
              fontSize: 11,
            }}
          >
            <span style={{ color: "var(--q-text-light)" }}>Duración</span>
            <span style={{ fontFamily: "var(--q-font-mono)" }}>{fmtTime(track.durationSec)}</span>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <Button
              variant="filled"
              icon="play_arrow"
              style={{ flex: 1 }}
              onClick={() => onPlay(track.path)}
            >
              Reproducir
            </Button>
            <Button variant="soft" icon="content_cut" onClick={() => onEdit(track)}>
              Editar
            </Button>
          </div>

          <div style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: ".4px",
                textTransform: "uppercase",
                color: "var(--q-text-secondary)",
                marginBottom: 8,
              }}
            >
              Playlists
            </div>
            {spaceGroups.every((g) => g.playlists.length === 0) ? (
              <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
                No hay playlists en ningún espacio.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {spaceGroups
                  .filter((g) => g.playlists.length > 0)
                  .map((g) => (
                    <div key={g.spaceId}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 10,
                          fontWeight: 500,
                          color: "var(--q-text-light)",
                          marginBottom: 5,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: g.color,
                            flex: "0 0 auto",
                          }}
                        />
                        {g.spaceName}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {g.playlists.map((p) => {
                          const isIn = p.trackPaths.includes(track.path);
                          return (
                            <MembershipChip
                              key={p.id}
                              name={p.name}
                              active={isIn}
                              onClick={() => onToggleInPlaylist(g.spaceId, p.id, isIn)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <DeleteSection track={track} onDelete={onDelete} />
        </>
      ) : (
        <div style={{ marginTop: 18, fontSize: 12, color: "var(--q-text-light)", textAlign: "center" }}>
          Seleccioná un track para ver sus datos.
        </div>
      )}
    </div>
  );
});

// ── Cover ─────────────────────────────────────────────────────────────────────

function Cover({ track }: { track: Track | null }) {
  const [cover, setCover] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!track) {
      setCover(null);
      return;
    }
    const seq = ++reqId.current;
    library
      .getCover(track.path)
      .then((c) => {
        if (seq === reqId.current) setCover(c);
      })
      .catch(() => {
        if (seq === reqId.current) setCover(null);
      });
  }, [track?.path]);

  const onPick = async () => {
    if (!track || busy) return;
    try {
      const picked = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: "Imágenes", extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (typeof picked !== "string") return;
      setBusy(true);
      await library.setCover(track.path, picked);
      // recargar
      const fresh = await library.getCover(track.path);
      const seq = ++reqId.current;
      if (seq === reqId.current) setCover(fresh);
    } catch {
      // silencioso: si el usuario cancela o falla, la imagen previa se mantiene.
    } finally {
      setBusy(false);
    }
  };

  const clickable = !!track;
  return (
    <div
      onClick={clickable ? onPick : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={clickable ? "Click para elegir portada" : undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        background: cover ? "var(--q-background)" : "linear-gradient(135deg, #2A7E73 0%, #2A2D31 100%)",
        border: "1px solid var(--q-border-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        cursor: clickable ? "pointer" : "default",
      }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <Icon name="music_note" size={64} color="rgba(255,255,255,.18)" weight={300} />
      )}
      {clickable && (hover || busy) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "#fff",
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          <Icon name={busy ? "sync" : "image"} size={26} color="#fff" />
          {busy ? "Guardando…" : "Cambiar portada"}
        </div>
      )}
    </div>
  );
}

// ── Título editable ───────────────────────────────────────────────────────────

function EditableTitle({
  track,
  onRename,
}: {
  track: Track;
  onRename: (name: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.title);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincronizar el draft cuando cambia el track (entrada con key={path} ya
  // remonta este componente, pero lo dejamos por defensa).
  useEffect(() => {
    setDraft(track.title);
    setEditing(false);
  }, [track.path, track.title]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const name = draft.trim();
    if (!name || name === track.title) {
      setDraft(track.title);
      setEditing(false);
      return;
    }
    setEditing(false);
    await onRename(name);
  };
  const cancel = () => {
    setDraft(track.title);
    setEditing(false);
  };

  return (
    <div
      style={{
        marginTop: 14,
        paddingBottom: 18,
        borderBottom: "1px solid var(--q-border)",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            else if (e.key === "Escape") cancel();
          }}
          style={{
            width: "100%",
            background: "var(--q-surface-alt)",
            border: "1px solid var(--q-primary-light)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--q-text-primary)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title="Click para renombrar"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--q-text-primary)",
            cursor: "text",
            padding: "4px 8px",
            margin: "-4px -8px",
            borderRadius: 6,
            background: hover ? "var(--q-card-hover)" : "transparent",
            transition: "background var(--q-dur-fast) var(--q-ease)",
            wordBreak: "break-word",
          }}
        >
          {track.title}
        </div>
      )}
    </div>
  );
}

// ── Botón borrar + confirmación ───────────────────────────────────────────────

function DeleteSection({
  track,
  onDelete,
}: {
  track: Track;
  onDelete: (path: string) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Si cambia el track, salir del modo confirmación.
  useEffect(() => {
    setConfirming(false);
    setBusy(false);
  }, [track.path]);

  if (!confirming) {
    return (
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <Button
          variant="destructive"
          icon="delete"
          style={{ width: "100%" }}
          onClick={() => setConfirming(true)}
        >
          Borrar archivo
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11.5, color: "var(--q-text-secondary)", lineHeight: 1.5 }}>
        Esto borra el archivo del disco y lo quita de todas las playlists. No se puede deshacer.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="text"
          disabled={busy}
          style={{ flex: 1 }}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
        <Button
          variant="destructive"
          icon={busy ? "sync" : "delete"}
          disabled={busy}
          style={{ flex: 1 }}
          onClick={async () => {
            setBusy(true);
            await onDelete(track.path);
            // Tras borrar, el track desaparece de `tracks`; este panel queda
            // con `track: null` por el padre.
          }}
        >
          {busy ? "Borrando…" : "Borrar"}
        </Button>
      </div>
    </div>
  );
}

// ── Chip de membresía ─────────────────────────────────────────────────────────

function MembershipChip({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        height: 24,
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        cursor: "default",
        background: active ? "var(--q-primary-soft)" : hover ? "var(--q-card-hover)" : "var(--q-surface-alt)",
        color: active ? "var(--q-primary-light)" : "var(--q-text-secondary)",
        border: "1px solid transparent",
        transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={active ? "check" : "add"} size={13} />
      {name}
    </span>
  );
}
