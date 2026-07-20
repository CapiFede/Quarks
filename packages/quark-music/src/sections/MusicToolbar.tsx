import { useEffect, useRef, useState } from "react";
import { QuarkToolbar, IconButton, TextInput, Icon, isAndroid } from "@quarks/core";
import type { MusicStore } from "../store";
import { useMusicState } from "../hooks/useMusicStore";
import type { Playlist, PlaylistView } from "../types";

export interface MusicToolbarProps {
  store: MusicStore;
}

type Editing = { kind: "new" } | { kind: "rename"; id: string } | null;

/**
 * Toolbar del music quark. La izquierda es un dropdown con la playlist activa
 * (incluye las vistas "Todas" / "Sin asignar" y la acción "Nueva playlist") más
 * el acceso rápido a randomizar la vista actual. La derecha es el menú de
 * settings (manejar playlists, carpeta, descarga). Borrar playlists ya no vive
 * acá: solo desde "Manejar playlists".
 */
export function MusicToolbar({ store }: MusicToolbarProps) {
  const { playlists, view, spaceId } = useMusicState(store);
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");

  // Ctrl/Cmd+F togglea el buscador (abre y cierra). La toolbar solo está montada
  // cuando este quark es el tab activo (el Shell renderiza únicamente la toolbar
  // activa), así que el listener global no necesita gate de visibilidad.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.toggleSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

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
    } else if (name && spaceId) {
      void store.renamePlaylist(spaceId, editing.id, name);
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

  const activePlaylist = playlists.find((p) => p.id === view) ?? null;

  return (
    <QuarkToolbar
      left={
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 2,
            minWidth: 0,
            height: "100%",
          }}
        >
          {editing ? (
            <span>{editor}</span>
          ) : (
            <>
              <PlaylistDropdown
                view={view}
                playlists={playlists}
                onSelect={(v) => store.selectView(v)}
                onNew={startNew}
                onRenameActive={activePlaylist ? () => startRename(activePlaylist) : undefined}
              />
              <ShuffleAffordance visible onClick={() => void store.startShuffle(view)} />
            </>
          )}
        </div>
      }
      right={
        <SettingsMenu
          onManage={() => store.openManage()}
          onOpenFolder={() => void store.openFolder()}
          onDownload={() => void store.openDownload()}
        />
      }
    />
  );
}

/** Ícono de randomizar (acceso rápido al modo aleatorio de la vista activa). */
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

// ── Dropdown de playlists (izquierda) ────────────────────────────────────────

/** Nombre visible de la vista activa. */
function viewLabel(view: PlaylistView, playlists: Playlist[]): string {
  if (view === "all") return "Todas";
  if (view === "unassigned") return "Sin asignar";
  return playlists.find((p) => p.id === view)?.name ?? "Todas";
}

function PlaylistDropdown({
  view,
  playlists,
  onSelect,
  onNew,
  onRenameActive,
}: {
  view: PlaylistView;
  playlists: Playlist[];
  onSelect: (v: PlaylistView) => void;
  onNew: () => void;
  onRenameActive?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
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
    <span ref={ref} style={{ position: "relative", display: "inline-flex", minWidth: 0 }}>
      <div
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={onRenameActive}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={onRenameActive ? "Doble click para renombrar" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 6px 0 10px",
          height: 26,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--q-text-primary)",
          background: open || hover ? "var(--q-surface-alt)" : "transparent",
          borderRadius: 6,
          cursor: "default",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition:
            "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {viewLabel(view, playlists)}
        </span>
        <Icon name="arrow_drop_down" size={18} color="var(--q-text-secondary)" />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 1000,
            minWidth: 200,
            maxHeight: 320,
            overflowY: "auto",
            padding: 4,
            background: "var(--q-surface)",
            border: "1px solid var(--q-border-light)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,.4)",
          }}
        >
          <MenuItem
            icon="library_music"
            label="Todas"
            checked={view === "all"}
            onClick={run(() => onSelect("all"))}
          />
          <MenuItem
            icon="label_off"
            label="Sin asignar"
            checked={view === "unassigned"}
            onClick={run(() => onSelect("unassigned"))}
          />
          {playlists.length > 0 && <MenuDivider />}
          {playlists.map((p) => (
            <MenuItem
              key={p.id}
              icon="queue_music"
              label={p.name}
              checked={view === p.id}
              onClick={run(() => onSelect(p.id))}
            />
          ))}
          <MenuDivider />
          <MenuItem icon="playlist_add" label="Nueva playlist" onClick={run(onNew)} />
        </div>
      )}
    </span>
  );
}

// ── Menú de settings (derecha) ──────────────────────────────────────────────

function SettingsMenu({
  onManage,
  onOpenFolder,
  onDownload,
}: {
  onManage: () => void;
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
          <MenuItem icon="checklist" label="Manejar playlists" onClick={run(onManage)} />
          {/* "Abrir carpeta" y "Descargar" son desktop-only (ver MusicPage). */}
          {!isAndroid && (
            <>
              <MenuDivider />
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
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {checked && <Icon name="check" size={15} color="var(--q-primary-light)" />}
    </div>
  );
}
