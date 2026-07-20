import { useEffect, useState } from "react";
import { Icon, IconButton, TextInput, useActiveSpace } from "@quarks/core";
import type { MusicStore, SpacePlaylists } from "../store";
import { useMusicState } from "../hooks/useMusicStore";

export interface ManagePlaylistsProps {
  store: MusicStore;
}

type Editing =
  | { kind: "rename"; spaceId: string; id: string }
  | { kind: "new"; spaceId: string }
  | null;

/**
 * Diálogo "Manejar playlists": lista las playlists de TODOS los spaces,
 * agrupadas por space. Desde acá se puede abrir una playlist (aunque sea de
 * otro space: el Shell salta de space), renombrarla, crear una nueva en
 * cualquier space, y borrar — la única vía de borrado (confirmación en dos
 * pasos por fila). Vive dentro del pane del quark (como DownloadDialog) porque
 * el Shell aún no monta `buildOverlay`.
 */
export function ManagePlaylists({ store }: ManagePlaylistsProps) {
  const state = useMusicState(store);
  const space = useActiveSpace();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!state.manageOpen) return;
    setConfirmId(null);
    setEditing(null);
    setDraft("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store.closeManage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.manageOpen, store]);

  if (!state.manageOpen) return null;

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };
  const commitEdit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (name) {
      if (editing.kind === "rename") {
        void store.renamePlaylist(editing.spaceId, editing.id, name);
      } else {
        void store.createPlaylistInSpace(editing.spaceId, name);
      }
    }
    cancelEdit();
  };

  // Space activo primero (desde el estado vivo del store), después el resto.
  const groups: SpacePlaylists[] = [
    {
      spaceId: space.id,
      spaceName: space.name,
      color: space.color,
      playlists: state.playlists,
    },
    ...state.otherSpaces,
  ];

  return (
    <div
      onClick={() => store.closeManage()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
          background: "var(--q-surface)",
          border: "1px solid var(--q-border-light)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 18px 50px rgba(0,0,0,.45)",
          color: "var(--q-text-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="checklist" size={18} color="var(--q-primary-light)" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Manejar playlists</div>
          <IconButton name="close" tooltip="Cerrar" onClick={() => store.closeManage()} />
        </div>

        <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {groups.map((g) => (
            <SpaceGroup
              key={g.spaceId}
              group={g}
              editing={editing}
              draft={draft}
              confirmId={confirmId}
              onDraft={setDraft}
              onCommitEdit={commitEdit}
              onCancelEdit={cancelEdit}
              onStartRename={(id, name) => {
                setEditing({ kind: "rename", spaceId: g.spaceId, id });
                setDraft(name);
                setConfirmId(null);
              }}
              onStartNew={() => {
                setEditing({ kind: "new", spaceId: g.spaceId });
                setDraft("");
                setConfirmId(null);
              }}
              onOpen={(id) => store.openPlaylist(g.spaceId, id)}
              onAskDelete={setConfirmId}
              onCancelDelete={() => setConfirmId(null)}
              onDelete={(id) => {
                setConfirmId(null);
                void store.deletePlaylist(g.spaceId, id);
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SpaceGroup({
  group,
  editing,
  draft,
  confirmId,
  onDraft,
  onCommitEdit,
  onCancelEdit,
  onStartRename,
  onStartNew,
  onOpen,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  group: SpacePlaylists;
  editing: Editing;
  draft: string;
  confirmId: string | null;
  onDraft: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartRename: (id: string, name: string) => void;
  onStartNew: () => void;
  onOpen: (id: string) => void;
  onAskDelete: (id: string) => void;
  onCancelDelete: () => void;
  onDelete: (id: string) => void;
}) {
  const editorRow = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 32, padding: "0 8px" }}>
      <Icon name="queue_music" size={16} color="var(--q-text-secondary)" />
      <TextInput
        value={draft}
        onChange={onDraft}
        autoFocus
        placeholder="Nombre…"
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommitEdit();
          else if (e.key === "Escape") {
            // Que el Escape cancele la edición sin cerrar el modal.
            e.stopPropagation();
            onCancelEdit();
          }
        }}
        onBlur={onCommitEdit}
        style={{ height: 24, flex: 1 }}
      />
    </div>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".4px",
          textTransform: "uppercase",
          color: "var(--q-text-secondary)",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: group.color,
            flex: "0 0 auto",
          }}
        />
        {group.spaceName}
      </div>
      {group.playlists.map((p) =>
        editing?.kind === "rename" && editing.spaceId === group.spaceId && editing.id === p.id ? (
          <span key={p.id}>{editorRow}</span>
        ) : (
          <PlaylistRow
            key={p.id}
            name={p.name}
            count={p.trackPaths.length}
            confirming={confirmId === p.id}
            onOpen={() => onOpen(p.id)}
            onStartRename={() => onStartRename(p.id, p.name)}
            onAskDelete={() => onAskDelete(p.id)}
            onCancelDelete={onCancelDelete}
            onDelete={() => onDelete(p.id)}
          />
        ),
      )}
      {editing?.kind === "new" && editing.spaceId === group.spaceId ? (
        editorRow
      ) : (
        <NewPlaylistRow onClick={onStartNew} />
      )}
    </div>
  );
}

function PlaylistRow({
  name,
  count,
  confirming,
  onOpen,
  onStartRename,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  name: string;
  count: number;
  confirming: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Abrir playlist"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 8px",
        borderRadius: 6,
        background: hover ? "var(--q-card-hover)" : "transparent",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name="queue_music" size={16} color="var(--q-text-secondary)" />
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span style={{ fontSize: 11, color: "var(--q-text-light)", flex: "0 0 auto" }}>
        {count === 1 ? "1 canción" : `${count} canciones`}
      </span>
      {confirming ? (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "0 0 auto" }}
        >
          <span
            onClick={onDelete}
            style={{ fontSize: 11, fontWeight: 600, color: "var(--q-error)", cursor: "default" }}
          >
            ¿Borrar?
          </span>
          <IconButton name="close" tooltip="Cancelar" onClick={onCancelDelete} />
        </span>
      ) : (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            flex: "0 0 auto",
            opacity: hover ? 1 : 0,
            pointerEvents: hover ? "auto" : "none",
            transition: "opacity var(--q-dur-fast) var(--q-ease)",
          }}
        >
          <IconButton name="edit" tooltip="Renombrar" onClick={onStartRename} />
          <IconButton name="delete" tooltip="Borrar playlist" onClick={onAskDelete} />
        </span>
      )}
    </div>
  );
}

/** Ítem fantasma al pie de cada space para crear una playlist ahí. */
function NewPlaylistRow({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 28,
        padding: "0 8px",
        borderRadius: 6,
        fontSize: 12,
        color: hover ? "var(--q-primary-light)" : "var(--q-text-light)",
        background: hover ? "var(--q-card-hover)" : "transparent",
        cursor: "default",
        transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name="add" size={15} />
      Nueva playlist
    </div>
  );
}
