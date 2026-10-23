import { Fragment, useEffect, useState } from "react";
import { Icon, IconButton, TextInput, useStoreState } from "@quarks/core";
import type { MusicStore } from "../store";
import type { Category, Playlist } from "../types";
import { Chip } from "./Chip";

export interface ManagePlaylistsProps {
  store: MusicStore;
}

type Editing =
  | { kind: "rename"; id: string }
  | { kind: "new" }
  | { kind: "renameCategory"; id: string }
  | { kind: "newCategory" }
  | null;

/**
 * Diálogo "Manejar playlists": lista las playlists agrupadas por categoría
 * (las sueltas primero). Desde acá se puede abrir una playlist o una
 * categoría, renombrar, crear playlists y categorías, mover una playlist a
 * otra categoría, y borrar — la única vía de borrado (confirmación en dos
 * pasos por fila). Vive dentro del pane del quark (como DownloadDialog).
 */
export function ManagePlaylists({ store }: ManagePlaylistsProps) {
  const state = useStoreState(store);
  /** Playlist o categoría con el "¿Borrar?" a la vista (los ids no se pisan). */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** Playlist con el selector "Mover a" abierto. */
  const [movingId, setMovingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!state.manageOpen) return;
    setConfirmId(null);
    setMovingId(null);
    setEditing(null);
    setDraft("");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store.closeManage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.manageOpen, store]);

  if (!state.manageOpen) return null;

  const startEdit = (next: Editing, name = "") => {
    setEditing(next);
    setDraft(name);
    setConfirmId(null);
    setMovingId(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };
  const commitEdit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (name) {
      if (editing.kind === "rename") void store.renamePlaylist(editing.id, name);
      else if (editing.kind === "new") void store.createPlaylist(name, null, false);
      else if (editing.kind === "renameCategory") void store.renameCategory(editing.id, name);
      else void store.createCategory(name, false);
    }
    cancelEdit();
  };
  const askDelete = (id: string | null) => {
    setConfirmId(id);
    setMovingId(null);
  };
  const toggleMoving = (id: string) => {
    setMovingId(movingId === id ? null : id);
    setConfirmId(null);
  };
  const isEditing = (kind: NonNullable<Editing>["kind"], id?: string) =>
    editing?.kind === kind && (id === undefined || ("id" in editing && editing.id === id));

  const { playlists, categories } = state;

  const editorRow = (icon: string, indent = false) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: indent ? "0 8px 0 26px" : "0 8px",
        flex: 1,
      }}
    >
      <Icon name={icon} size={16} color="var(--q-text-secondary)" />
      <TextInput
        value={draft}
        onChange={setDraft}
        autoFocus
        placeholder="Nombre…"
        onKeyDown={(e) => {
          if (e.key === "Enter") commitEdit();
          else if (e.key === "Escape") {
            // Que el Escape cancele la edición sin cerrar el modal.
            e.stopPropagation();
            cancelEdit();
          }
        }}
        onBlur={commitEdit}
        style={{ height: 24, flex: 1 }}
      />
    </div>
  );

  const playlistRow = (p: Playlist, indent: boolean) =>
    isEditing("rename", p.id) ? (
      <Fragment key={p.id}>{editorRow("queue_music", indent)}</Fragment>
    ) : (
      <Fragment key={p.id}>
        <Row
          icon="queue_music"
          name={p.name}
          detail={p.trackPaths.length === 1 ? "1 canción" : `${p.trackPaths.length} canciones`}
          indent={indent}
          openTitle="Abrir playlist"
          deleteTooltip="Borrar playlist"
          confirming={confirmId === p.id}
          moving={movingId === p.id}
          onOpen={() => store.openPlaylist(p.id)}
          onStartRename={() => startEdit({ kind: "rename", id: p.id }, p.name)}
          // Sin categorías no hay a dónde mover.
          onMove={categories.length > 0 ? () => toggleMoving(p.id) : undefined}
          onAskDelete={() => askDelete(p.id)}
          onCancelDelete={() => askDelete(null)}
          onDelete={() => {
            askDelete(null);
            void store.deletePlaylist(p.id);
          }}
        />
        {movingId === p.id && (
          <MovePicker
            categories={categories}
            current={p.categoryId}
            indent={indent}
            onPick={(categoryId) => {
              setMovingId(null);
              if (categoryId !== p.categoryId) void store.setPlaylistCategory(p.id, categoryId);
            }}
          />
        )}
      </Fragment>
    );

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

        <div style={{ overflowY: "auto" }}>
          {playlists.filter((p) => p.categoryId === null).map((p) => playlistRow(p, false))}

          {categories.map((c: Category) => {
            const inside = playlists.filter((p) => p.categoryId === c.id);
            return (
              <Fragment key={c.id}>
                {isEditing("renameCategory", c.id) ? (
                  editorRow("folder")
                ) : (
                  <Row
                    icon="folder"
                    name={c.name}
                    strong
                    detail={inside.length === 1 ? "1 playlist" : `${inside.length} playlists`}
                    openTitle="Abrir categoría"
                    deleteTooltip="Borrar categoría (sus playlists quedan sueltas)"
                    reserveMove
                    confirming={confirmId === c.id}
                    onOpen={() => store.openCategory(c.id)}
                    onStartRename={() => startEdit({ kind: "renameCategory", id: c.id }, c.name)}
                    onAskDelete={() => askDelete(c.id)}
                    onCancelDelete={() => askDelete(null)}
                    onDelete={() => {
                      askDelete(null);
                      void store.deleteCategory(c.id);
                    }}
                  />
                )}
                {inside.map((p) => playlistRow(p, true))}
              </Fragment>
            );
          })}

          <div style={{ display: "flex", gap: 4 }}>
            {isEditing("new") ? (
              editorRow("queue_music")
            ) : isEditing("newCategory") ? (
              editorRow("folder")
            ) : (
              <>
                <GhostRow icon="add" label="Nueva playlist" onClick={() => startEdit({ kind: "new" })} />
                <GhostRow
                  icon="create_new_folder"
                  label="Nueva categoría"
                  onClick={() => startEdit({ kind: "newCategory" })}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Fila de playlist o de categoría: abrir, renombrar, (mover) y borrar en dos pasos. */
function Row({
  icon,
  name,
  detail,
  strong,
  indent,
  openTitle,
  deleteTooltip,
  confirming,
  moving,
  reserveMove,
  onOpen,
  onStartRename,
  onMove,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  icon: string;
  name: string;
  detail: string;
  /** Nombre en negrita (cabecera de categoría). */
  strong?: boolean;
  /** Sangría de playlist dentro de una categoría. */
  indent?: boolean;
  openTitle: string;
  deleteTooltip: string;
  confirming: boolean;
  /** El selector "Mover a" de esta fila está abierto. */
  moving?: boolean;
  /** Sin `onMove`, deja igual el hueco de su botón: alinea el detalle con
   *  las filas de playlist, que sí lo tienen. */
  reserveMove?: boolean;
  onOpen: () => void;
  onStartRename: () => void;
  onMove?: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const showActions = hover || !!moving;
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={openTitle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: indent ? "0 8px 0 26px" : "0 8px",
        borderRadius: 6,
        background: hover ? "var(--q-card-hover)" : "transparent",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={16} color="var(--q-text-secondary)" />
      <span
        style={{
          flex: 1,
          fontSize: 12.5,
          fontWeight: strong ? 600 : undefined,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span style={{ fontSize: 11, color: "var(--q-text-light)", flex: "0 0 auto" }}>
        {detail}
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
            opacity: showActions ? 1 : 0,
            pointerEvents: showActions ? "auto" : "none",
            transition: "opacity var(--q-dur-fast) var(--q-ease)",
          }}
        >
          {onMove && (
            <IconButton
              name="drive_file_move"
              tooltip="Mover a categoría"
              selected={moving}
              onClick={onMove}
            />
          )}
          {!onMove && reserveMove && <span style={{ width: 28 }} />}
          <IconButton name="edit" tooltip="Renombrar" onClick={onStartRename} />
          <IconButton name="delete" tooltip={deleteTooltip} onClick={onAskDelete} />
        </span>
      )}
    </div>
  );
}

/** Chips "Mover a" debajo de una playlist: sus destinos posibles. */
function MovePicker({
  categories,
  current,
  indent,
  onPick,
}: {
  categories: Category[];
  current: string | null;
  indent: boolean;
  onPick: (categoryId: string | null) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        padding: indent ? "2px 8px 8px 50px" : "2px 8px 8px 32px",
      }}
    >
      <span style={{ fontSize: 11, color: "var(--q-text-light)" }}>Mover a</span>
      <Chip label="Sin categoría" active={current === null} addIcon={false} onClick={() => onPick(null)} />
      {categories.map((c) => (
        <Chip
          key={c.id}
          addIcon={false}
          label={c.name}
          active={current === c.id}
          onClick={() => onPick(c.id)}
        />
      ))}
    </div>
  );
}

/** Ítem fantasma al pie de la lista para crear una playlist o una categoría. */
function GhostRow({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
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
      <Icon name={icon} size={15} />
      {label}
    </div>
  );
}
