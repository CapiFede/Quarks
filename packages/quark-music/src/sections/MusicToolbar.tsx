import { useEffect, useState, type ReactNode } from "react";
import {
  QuarkToolbar,
  IconButton,
  TextInput,
  Icon,
  isAndroid,
  useStoreState,
  MenuDivider,
  MenuItem,
  MenuPanel,
  useMenu,
} from "@quarks/core";
import { viewSize, type MusicStore } from "../store";
import type { Category, Playlist, PlaylistView, PlayOrder, TrackSort } from "../types";
import { PLAY_ORDERS, TRACK_SORTS } from "../util";

export interface MusicToolbarProps {
  store: MusicStore;
}

type Editing =
  | { kind: "newPlaylist" }
  | { kind: "renamePlaylist"; id: string }
  | { kind: "newCategory" }
  | { kind: "renameCategory"; id: string }
  | null;

/**
 * Toolbar del music quark. La izquierda es un breadcrumb de dos dropdowns:
 * categoría (o "Biblioteca") › playlist, más el acceso rápido a reproducir la
 * vista actual en un orden. En "Biblioteca" el segundo lista las pseudo-vistas ("Todas" /
 * "Sin asignar") y las playlists sueltas; en una categoría lista sus playlists,
 * y su "Todas" es la categoría entera como una playlist grande. La derecha es
 * el menú de settings (manejar playlists, carpeta, descarga). Borrar playlists
 * y categorías no vive acá: solo desde "Manejar playlists".
 */
export function MusicToolbar({ store }: MusicToolbarProps) {
  const state = useStoreState(store);
  const { playlists, categories, category, view } = state;
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

  const startEdit = (next: Editing, name = "") => {
    setEditing(next);
    setDraft(name);
  };
  const cancel = () => {
    setEditing(null);
    setDraft("");
  };
  const commit = () => {
    if (!editing) return;
    const name = draft.trim();
    if (name) {
      if (editing.kind === "newPlaylist") void store.createPlaylist(name, category, true);
      else if (editing.kind === "newCategory") void store.createCategory(name, true);
      else if (editing.kind === "renamePlaylist") void store.renamePlaylist(editing.id, name);
      else void store.renameCategory(editing.id, name);
    }
    cancel();
  };

  const editor = (
    <TextInput
      value={draft}
      onChange={setDraft}
      autoFocus
      placeholder={
        editing?.kind === "newCategory" || editing?.kind === "renameCategory"
          ? "Nombre de la categoría…"
          : "Nombre…"
      }
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      style={{ height: 24, width: 170 }}
    />
  );

  const activeCategory = categories.find((c) => c.id === category) ?? null;
  // Por el invariante del store, la playlist abierta siempre es de `category`.
  const scoped = playlists.filter((p) => p.categoryId === category);
  const activePlaylist = scoped.find((p) => p.id === view) ?? null;

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
              <CategoryDropdown
                category={category}
                categories={categories}
                size={(c) => viewSize(state, c, "all")}
                onSelect={(c) => store.selectCategory(c)}
                onNew={() => startEdit({ kind: "newCategory" })}
                onRenameActive={
                  activeCategory
                    ? () => startEdit({ kind: "renameCategory", id: activeCategory.id }, activeCategory.name)
                    : undefined
                }
              />
              <Icon name="chevron_right" size={16} color="var(--q-text-light)" />
              <PlaylistDropdown
                view={view}
                inCategory={category !== null}
                playlists={scoped}
                size={(v) => viewSize(state, category, v)}
                onSelect={(v) => store.selectView(v)}
                onNew={() => startEdit({ kind: "newPlaylist" })}
                onRenameActive={
                  activePlaylist
                    ? () => startEdit({ kind: "renamePlaylist", id: activePlaylist.id }, activePlaylist.name)
                    : undefined
                }
              />
              <PlayMenu onPlay={(order) => void store.playViewIn(order)} />
              <SortMenu sort={state.sort} onSort={(s) => store.setSort(s)} />
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

/**
 * Acceso rápido para reproducir la vista actual en un orden (aleatorio, menos
 * o más escuchadas primero…). Deja ese orden elegido en el player.
 */
function PlayMenu({ onPlay }: { onPlay: (order: PlayOrder) => void }) {
  const menu = useMenu<HTMLSpanElement>();
  const [hover, setHover] = useState(false);
  return (
    <span ref={menu.ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => menu.setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Reproducir esta vista…"
        style={{ display: "inline-flex", alignItems: "center", marginLeft: 2, padding: 1 }}
      >
        <Icon
          name="play_circle"
          size={15}
          color={
            hover || menu.open ? "var(--q-primary-light)" : "var(--q-text-secondary)"
          }
        />
      </span>
      {menu.open && (
        <MenuPanel minWidth={220}>
          {PLAY_ORDERS.map((o) => (
            <MenuItem
              key={o.id}
              icon={o.icon}
              label={o.label}
              onClick={menu.run(() => onPlay(o.id))}
            />
          ))}
        </MenuPanel>
      )}
    </span>
  );
}

/**
 * Orden de la lista: el propio de la vista, por nombre o por fecha de creación.
 * El ícono queda resaltado mientras no sea el de la lista.
 */
function SortMenu({ sort, onSort }: { sort: TrackSort; onSort: (s: TrackSort) => void }) {
  const menu = useMenu<HTMLSpanElement>();
  const [hover, setHover] = useState(false);
  return (
    <span ref={menu.ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => menu.setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="Ordenar…"
        style={{ display: "inline-flex", alignItems: "center", marginLeft: 2, padding: 1 }}
      >
        <Icon
          name="sort"
          size={15}
          color={
            hover || menu.open || sort !== "list"
              ? "var(--q-primary-light)"
              : "var(--q-text-secondary)"
          }
        />
      </span>
      {menu.open && (
        <MenuPanel minWidth={200}>
          {TRACK_SORTS.map((s) => (
            <MenuItem
              key={s.id}
              icon={s.icon}
              label={s.label}
              checked={sort === s.id}
              onClick={menu.run(() => onSort(s.id))}
            />
          ))}
        </MenuPanel>
      )}
    </span>
  );
}

// ── Dropdowns de categoría y playlist (izquierda) ────────────────────────────

function CategoryDropdown({
  category,
  categories,
  size,
  onSelect,
  onNew,
  onRenameActive,
}: {
  category: string | null;
  categories: Category[];
  /** Canciones de la biblioteca (`null`) o de una categoría entera. */
  size: (c: string | null) => number;
  onSelect: (c: string | null) => void;
  onNew: () => void;
  onRenameActive?: () => void;
}) {
  const label = categories.find((c) => c.id === category)?.name ?? "Biblioteca";
  return (
    <Dropdown label={label} onRename={onRenameActive}>
      {(run) => (
        <>
          <MenuItem
            icon="library_music"
            label="Biblioteca"
            count={size(null)}
            checked={category === null}
            onClick={run(() => onSelect(null))}
          />
          {categories.length > 0 && <MenuDivider />}
          {categories.map((c) => (
            <MenuItem
              key={c.id}
              icon="folder"
              label={c.name}
              count={size(c.id)}
              checked={category === c.id}
              onClick={run(() => onSelect(c.id))}
            />
          ))}
          <MenuDivider />
          <MenuItem icon="create_new_folder" label="Nueva categoría" onClick={run(onNew)} />
        </>
      )}
    </Dropdown>
  );
}

/** Nombre visible de la vista activa. */
function viewLabel(view: PlaylistView, playlists: Playlist[]): string {
  if (view === "all") return "Todas";
  if (view === "unassigned") return "Sin asignar";
  return playlists.find((p) => p.id === view)?.name ?? "Todas";
}

function PlaylistDropdown({
  view,
  inCategory,
  playlists,
  size,
  onSelect,
  onNew,
  onRenameActive,
}: {
  view: PlaylistView;
  /** Hay una categoría elegida: "Todas" es la categoría entera y no hay "Sin asignar". */
  inCategory: boolean;
  /** Playlists de la categoría elegida (o las sueltas, en la biblioteca). */
  playlists: Playlist[];
  /** Canciones de una vista, en la categoría elegida. */
  size: (v: PlaylistView) => number;
  onSelect: (v: PlaylistView) => void;
  onNew: () => void;
  onRenameActive?: () => void;
}) {
  return (
    <Dropdown label={viewLabel(view, playlists)} onRename={onRenameActive}>
      {(run) => (
        <>
          <MenuItem
            icon={inCategory ? "queue_music" : "library_music"}
            label="Todas"
            count={size("all")}
            checked={view === "all"}
            onClick={run(() => onSelect("all"))}
          />
          {!inCategory && (
            <MenuItem
              icon="label_off"
              label="Sin asignar"
              count={size("unassigned")}
              checked={view === "unassigned"}
              onClick={run(() => onSelect("unassigned"))}
            />
          )}
          {playlists.length > 0 && <MenuDivider />}
          {playlists.map((p) => (
            <MenuItem
              key={p.id}
              icon="queue_music"
              label={p.name}
              count={size(p.id)}
              checked={view === p.id}
              onClick={run(() => onSelect(p.id))}
            />
          ))}
          <MenuDivider />
          <MenuItem icon="playlist_add" label="Nueva playlist" onClick={run(onNew)} />
        </>
      )}
    </Dropdown>
  );
}

/**
 * Botón con el nombre de lo elegido + menú desplegable. `children` arma el
 * menú y recibe `run`, que envuelve una acción para que además lo cierre.
 * Doble click sobre el botón = renombrar (si `onRename`).
 */
function Dropdown({
  label,
  onRename,
  children,
}: {
  label: string;
  onRename?: () => void;
  children: (run: (fn: () => void) => () => void) => ReactNode;
}) {
  const menu = useMenu<HTMLSpanElement>();
  const [hover, setHover] = useState(false);

  return (
    <span ref={menu.ref} style={{ position: "relative", display: "inline-flex", minWidth: 0 }}>
      <div
        onClick={() => menu.setOpen((o) => !o)}
        onDoubleClick={onRename}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={onRename ? "Doble click para renombrar" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
          padding: "0 6px 0 10px",
          height: 26,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--q-text-primary)",
          background: menu.open || hover ? "var(--q-surface-alt)" : "transparent",
          borderRadius: 6,
          cursor: "default",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          transition:
            "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <Icon name="arrow_drop_down" size={18} color="var(--q-text-secondary)" />
      </div>
      {menu.open && <MenuPanel>{children(menu.run)}</MenuPanel>}
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
  const menu = useMenu<HTMLSpanElement>();

  return (
    <span ref={menu.ref} style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        name="settings"
        tooltip="Opciones"
        selected={menu.open}
        onClick={() => menu.setOpen((o) => !o)}
      />
      {menu.open && (
        <MenuPanel align="right" minWidth={212}>
          <MenuItem icon="checklist" label="Manejar playlists" onClick={menu.run(onManage)} />
          {/* "Abrir carpeta" y "Descargar" son desktop-only (ver MusicPage). */}
          {!isAndroid && (
            <>
              <MenuDivider />
              <MenuItem
                icon="folder_open"
                label="Abrir carpeta de música"
                onClick={menu.run(onOpenFolder)}
              />
              <MenuDivider />
              <MenuItem
                icon="download"
                label="Descargar de YouTube"
                onClick={menu.run(onDownload)}
              />
            </>
          )}
        </MenuPanel>
      )}
    </span>
  );
}
