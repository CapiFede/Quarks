import { useEffect, useRef, useState, type CSSProperties } from "react";
import { QuarkToolbar, IconButton, TextInput, Icon, isAndroid } from "@quarks/core";
import type { MusicStore } from "../store";
import { useMusicState } from "../hooks/useMusicStore";
import type { Playlist, PlaylistView } from "../types";

export interface MusicToolbarProps {
  store: MusicStore;
}

type Editing = { kind: "new" } | { kind: "rename"; id: string } | null;

/**
 * Toolbar del music quark. La izquierda es el strip de chips de las playlists del
 * space activo; las vistas "Todas" / "Sin asignar" ya no son chips fijos sino
 * opciones del menú de settings (derecha), y al elegirlas aparecen como un chip
 * momentáneo en el strip. Cada chip lleva un ícono de randomizar (acceso rápido
 * al modo aleatorio) detrás del nombre.
 */
export function MusicToolbar({ store }: MusicToolbarProps) {
  const { playlists, view, searchOpen } = useMusicState(store);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");

  const startNew = () => {
    setEditing({ kind: "new" });
    setDraft("");
  };
  const startRename = (p: Playlist) => {
    setEditing({ kind: "rename", id: p.id });
    setDraft(p.name);
  };
  const cancel = () => {
    setEditing(null);
    setDraft("");
  };
  const commit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (editing.kind === "new") {
      if (name) void store.createPlaylist(name);
    } else if (name) {
      void store.renamePlaylist(editing.id, name);
    }
    cancel();
  };

  const editor = (
    <TextInput
      value={draft}
      onChange={setDraft}
      autoFocus
      placeholder="Nombre…"
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      style={{ height: 24, width: 150 }}
    />
  );

  // Chip momentáneo de la vista "Todas" / "Sin asignar" (solo mientras está activa).
  const pseudoView = view === "all" || view === "unassigned" ? view : null;

  return (
    <QuarkToolbar
      left={
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 2,
            overflowX: "auto",
            minWidth: 0,
            height: "100%",
          }}
        >
          {pseudoView && (
            <PseudoChip
              name={pseudoView === "all" ? "Todas" : "Sin asignar"}
              onShuffle={() => void store.startShuffle(pseudoView)}
            />
          )}
          {pseudoView && playlists.length > 0 && <Divider />}
          {playlists.map((p) =>
            editing?.kind === "rename" && editing.id === p.id ? (
              <span key={p.id}>{editor}</span>
            ) : (
              <PlaylistChip
                key={p.id}
                playlist={p}
                selected={view === p.id}
                onClick={() => store.selectView(p.id)}
                onShuffle={() => void store.startShuffle(p.id)}
                onRename={() => startRename(p)}
                onDelete={() => void store.deletePlaylist(p.id)}
              />
            ),
          )}
          {editing?.kind === "new" && <span>{editor}</span>}
        </div>
      }
      right={
        <SettingsMenu
          view={view}
          searchOpen={searchOpen}
          onToggleSearch={() => store.toggleSearch()}
          onSelectView={(v) => store.selectView(v)}
          onNewPlaylist={startNew}
          onOpenFolder={() => void store.openFolder()}
          onDownload={() => void store.openDownload()}
        />
      }
    />
  );
}

function Divider() {
  return (
    <div
      style={{
        flex: "0 0 auto",
        width: 1,
        height: 16,
        background: "var(--q-border)",
        margin: "0 5px",
      }}
    />
  );
}

/** Ícono de randomizar que va detrás del nombre de un chip. */
function ShuffleAffordance({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Reproducir al azar"
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginLeft: 2,
        padding: 1,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon
        name="shuffle"
        size={13}
        color={hover ? "var(--q-primary-light)" : "var(--q-text-secondary)"}
      />
    </span>
  );
}

/** Chip momentáneo de "Todas" / "Sin asignar": siempre activo, con randomizar. */
function PseudoChip({ name, onShuffle }: { name: string; onShuffle: () => void }) {
  return (
    <div style={{ ...chipStyle(true, false), gap: 2 }}>
      {name}
      <ShuffleAffordance visible onClick={onShuffle} />
    </div>
  );
}

function PlaylistChip({
  playlist,
  selected,
  onClick,
  onShuffle,
  onRename,
  onDelete,
}: {
  playlist: Playlist;
  selected: boolean;
  onClick: () => void;
  onShuffle: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onDoubleClick={onRename}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Doble click para renombrar"
      style={{ ...chipStyle(selected, hover), gap: 2 }}
    >
      {playlist.name}
      <ShuffleAffordance visible={selected || hover} onClick={onShuffle} />
      {selected && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Eliminar playlist"
          style={{ display: "inline-flex", marginLeft: 1, marginRight: -4, padding: 1 }}
        >
          <Icon name="close" size={12} color="var(--q-text-secondary)" />
        </span>
      )}
    </div>
  );
}

function chipStyle(selected: boolean, hover: boolean): CSSProperties {
  return {
    position: "relative",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    height: 26,
    margin: "0 1px",
    fontSize: 12,
    fontWeight: selected ? 600 : 500,
    color: selected || hover ? "var(--q-text-primary)" : "var(--q-text-secondary)",
    background: selected ? "var(--q-surface-alt)" : hover ? "var(--q-card-hover)" : "transparent",
    borderRadius: 6,
    cursor: "default",
    whiteSpace: "nowrap",
    transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
  };
}

// ── Menú de settings (derecha) ──────────────────────────────────────────────

function SettingsMenu({
  view,
  searchOpen,
  onToggleSearch,
  onSelectView,
  onNewPlaylist,
  onOpenFolder,
  onDownload,
}: {
  view: PlaylistView;
  searchOpen: boolean;
  onToggleSearch: () => void;
  onSelectView: (v: PlaylistView) => void;
  onNewPlaylist: () => void;
  onOpenFolder: () => void;
  onDownload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        name="settings"
        tooltip="Opciones"
        selected={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1000,
            minWidth: 212,
            padding: 4,
            background: "var(--q-surface)",
            border: "1px solid var(--q-border-light)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,.4)",
          }}
        >
          <MenuItem icon="search" label="Buscar" checked={searchOpen} onClick={run(onToggleSearch)} />
          <MenuDivider />
          <MenuItem
            icon="library_music"
            label="Todas las canciones"
            checked={view === "all"}
            onClick={run(() => onSelectView("all"))}
          />
          <MenuItem
            icon="label_off"
            label="Sin asignar"
            checked={view === "unassigned"}
            onClick={run(() => onSelectView("unassigned"))}
          />
          <MenuDivider />
          <MenuItem icon="playlist_add" label="Nueva playlist" onClick={run(onNewPlaylist)} />
          {/* "Abrir carpeta" y "Descargar" son desktop-only (ver MusicPage). */}
          {!isAndroid && (
            <>
              <MenuItem
                icon="folder_open"
                label="Abrir carpeta de música"
                onClick={run(onOpenFolder)}
              />
              <MenuDivider />
              <MenuItem icon="download" label="Descargar de YouTube" onClick={run(onDownload)} />
            </>
          )}
        </div>
      )}
    </span>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "var(--q-border)", margin: "4px 6px" }} />;
}

function MenuItem({
  icon,
  label,
  checked,
  onClick,
}: {
  icon: string;
  label: string;
  checked?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 32,
        padding: "0 8px",
        borderRadius: 6,
        fontSize: 12.5,
        cursor: "default",
        whiteSpace: "nowrap",
        background: hover ? "var(--q-card-hover)" : "transparent",
        color: checked
          ? "var(--q-primary-light)"
          : hover
            ? "var(--q-text-primary)"
            : "var(--q-text-secondary)",
        transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={17} />
      <span style={{ flex: 1 }}>{label}</span>
      {checked && <Icon name="check" size={15} color="var(--q-primary-light)" />}
    </div>
  );
}
