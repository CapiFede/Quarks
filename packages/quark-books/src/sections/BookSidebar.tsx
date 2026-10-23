import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
} from "react";
import { Icon, TextInput, ConfirmDialog } from "@quarks/core";
import type { BooksStore } from "../store";
import { chaptersInGroup } from "../store";
import type { Book, Chapter } from "../types";

export interface BookSidebarProps {
  store: BooksStore;
  /** Libro activo cargado (con folders + chapters). */
  book: Book;
  activeChapterId: string | null;
  /** Capítulo borrador (en memoria, sin persistir) o `null`. */
  draftChapter?: Chapter | null;
}

/** Confirmación pendiente para el diálogo in-app (reemplaza `window.confirm`). */
type Confirm = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

type Editing =
  | { kind: "renameBook" }
  | { kind: "renameFolder"; id: string }
  | { kind: "renameChapter"; id: string }
  | { kind: "newFolder" }
  | { kind: "newChapter"; folderId: string | null }
  | null;

type Menu =
  | { kind: "book"; x: number; y: number }
  | { kind: "folder"; id: string; x: number; y: number }
  | { kind: "chapter"; id: string; x: number; y: number }
  | { kind: "root"; x: number; y: number }
  | null;

/** Posición de drop entre items: antes o después del item objetivo. */
type DropMark =
  | { kind: "folder"; folderId: string | null; position: number }
  | { kind: "into-folder"; folderId: string }
  | null;

/**
 * Sidebar con el árbol del libro activo. Replica visualmente el mockup
 * `Quarks Design System/ui_kit/BooksQuark.jsx` con tres extensiones:
 *   - Carpetas (un nivel) entre el libro y los capítulos.
 *   - Drag & drop nativo de capítulos (reordenar + mover entre carpetas).
 *   - Menú contextual (right-click) para renombrar/borrar/crear.
 */
export function BookSidebar({ store, book, activeChapterId, draftChapter }: BookSidebarProps) {
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<Menu>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // `dragging` se accede dentro de handlers de drag que corren ANTES de que React
  // re-renderee tras el dragstart. Usamos un ref para que el valor esté
  // disponible de forma síncrona; un mirror en state alimenta el visual.
  const draggingRef = useRef<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropMark, setDropMark] = useState<DropMark>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const startNewChapter = (folderId: string | null) => {
    setEditing({ kind: "newChapter", folderId });
    setDraft("");
  };
  const startNewFolder = () => {
    setEditing({ kind: "newFolder" });
    setDraft("");
  };
  const startRenameBook = () => {
    setEditing({ kind: "renameBook" });
    setDraft(book.title);
  };
  const startRenameFolder = (f: { id: string; name: string }) => {
    setEditing({ kind: "renameFolder", id: f.id });
    setDraft(f.name);
  };
  const startRenameChapter = (c: Chapter) => {
    setEditing({ kind: "renameChapter", id: c.id });
    setDraft(c.title);
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const commitEdit = () => {
    if (!editing) return;
    const value = draft.trim();
    switch (editing.kind) {
      case "renameBook":
        if (value) void store.renameBook(book.id, value);
        break;
      case "renameFolder":
        if (value) void store.renameFolder(editing.id, value);
        break;
      case "renameChapter":
        if (value) void store.renameChapter(editing.id, value);
        break;
      case "newFolder":
        if (value) void store.createFolder(value);
        break;
      case "newChapter":
        if (value) void store.createChapter(editing.folderId, value);
        break;
    }
    cancelEdit();
  };

  // ── Drag & drop ──
  const onDragStartChapter = (e: DragEvent, chapterId: string) => {
    draggingRef.current = chapterId;
    setDragging(chapterId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", chapterId);
  };
  const onDragEnd = () => {
    draggingRef.current = null;
    setDragging(null);
    setDropMark(null);
  };
  const onDropChapter = (
    e: DragEvent,
    folderId: string | null,
    targetPosition: number,
  ) => {
    e.preventDefault();
    const id = draggingRef.current;
    if (!id) return;
    void store.moveChapter(id, folderId, targetPosition);
    onDragEnd();
  };
  const onDropIntoFolder = (e: DragEvent, folderId: string) => {
    e.preventDefault();
    const id = draggingRef.current;
    if (!id) return;
    const inside = chaptersInGroup(book, folderId);
    void store.moveChapter(id, folderId, inside.length);
    onDragEnd();
  };

  const rootChapters = chaptersInGroup(book, null);
  const folders = [...book.folders].sort((a, b) => a.position - b.position);

  return (
    <div
      className="q-books-sidebar"
      data-dragging={dragging !== null ? "true" : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ kind: "root", x: e.clientX, y: e.clientY });
      }}
      // Aceptar el drag en cualquier punto del sidebar: si no hay un drop zone
      // específico bajo el cursor, igual se mantiene el cursor de "move" en
      // lugar del de "bloqueado".
      onDragOver={(e) => {
        if (draggingRef.current) e.preventDefault();
      }}
    >
      {/* Header del libro: click (o right-click) abre el menú del libro. */}
      <div
        className="q-books-book-header"
        data-clickable={editing?.kind === "renameBook" ? undefined : "true"}
        onClick={(e) => {
          if (editing?.kind === "renameBook") return;
          e.stopPropagation();
          setMenu({ kind: "book", x: e.clientX, y: e.clientY });
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenu({ kind: "book", x: e.clientX, y: e.clientY });
        }}
      >
        <Icon name="menu_book" size={14} color="var(--q-text-secondary)" />
        {editing?.kind === "renameBook" ? (
          <InlineEdit
            value={draft}
            onChange={setDraft}
            onCommit={commitEdit}
            onCancel={cancelEdit}
          />
        ) : (
          <>
            <span className="q-books-book-title">{book.title}</span>
            <Icon name="more_vert" size={14} color="var(--q-text-light)" />
          </>
        )}
      </div>

      {/* Capítulos en raíz */}
      <DropZone
        active={dragging !== null && dropMark?.kind === "folder" && dropMark.folderId === null && dropMark.position === 0}
        onDragOver={(e) => {
          if (!draggingRef.current) return;
          e.preventDefault();
          setDropMark({ kind: "folder", folderId: null, position: 0 });
        }}
        onDrop={(e) => onDropChapter(e, null, 0)}
      />
      {rootChapters.map((c, i) => (
        <div key={c.id}>
          <ChapterRow
            chapter={c}
            indent={12}
            active={c.id === activeChapterId}
            isEditing={editing?.kind === "renameChapter" && editing.id === c.id}
            draftValue={draft}
            onDraftChange={setDraft}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            onClick={() => void store.selectChapter(c.id)}
            onDoubleClick={() => startRenameChapter(c)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ kind: "chapter", id: c.id, x: e.clientX, y: e.clientY });
            }}
            dragging={dragging === c.id}
            onDragStart={(e) => onDragStartChapter(e, c.id)}
            onDragEnd={onDragEnd}
          />
          <DropZone
            active={dragging !== null && dropMark?.kind === "folder" && dropMark.folderId === null && dropMark.position === i + 1}
            onDragOver={(e) => {
              if (!draggingRef.current) return;
              e.preventDefault();
              setDropMark({ kind: "folder", folderId: null, position: i + 1 });
            }}
            onDrop={(e) => onDropChapter(e, null, i + 1)}
          />
        </div>
      ))}

      {/* Capítulo borrador (sin persistir): hoja inicial del libro. */}
      {draftChapter && (draftChapter.folderId ?? null) === null && (
        <ChapterRow
          chapter={draftChapter}
          indent={12}
          active={draftChapter.id === activeChapterId}
          placeholder
          draggable={false}
          isEditing={editing?.kind === "renameChapter" && editing.id === draftChapter.id}
          draftValue={draft}
          onDraftChange={setDraft}
          onCommit={commitEdit}
          onCancel={cancelEdit}
          onClick={() => void store.selectChapter(draftChapter.id)}
          onDoubleClick={() => startRenameChapter(draftChapter)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          dragging={false}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
      )}

      {/* New chapter inline (raíz) */}
      {editing?.kind === "newChapter" && editing.folderId === null && (
        <div className="q-books-chapter-row" style={{ paddingLeft: 12 }}>
          <InlineEdit
            value={draft}
            onChange={setDraft}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            placeholder="Nuevo capítulo…"
          />
        </div>
      )}

      {/* Carpetas */}
      {folders.map((folder) => {
        const inside = chaptersInGroup(book, folder.id);
        const intoActive = dragging !== null && dropMark?.kind === "into-folder" && dropMark.folderId === folder.id;
        return (
          <div key={folder.id}>
            <div
              className="q-books-folder-row"
              data-into-active={intoActive ? "true" : undefined}
              onClick={() => store.toggleFolder(folder.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ kind: "folder", id: folder.id, x: e.clientX, y: e.clientY });
              }}
              onDragOver={(e) => {
                if (!draggingRef.current) return;
                e.preventDefault();
                setDropMark({ kind: "into-folder", folderId: folder.id });
              }}
              onDrop={(e) => onDropIntoFolder(e, folder.id)}
            >
              <Icon
                name={folder.collapsed ? "folder" : "folder_open"}
                size={12}
                color="var(--q-text-secondary)"
              />
              {editing?.kind === "renameFolder" && editing.id === folder.id ? (
                <InlineEdit
                  value={draft}
                  onChange={setDraft}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
              ) : (
                <span
                  className="q-books-folder-name"
                  title="Doble click para renombrar"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startRenameFolder(folder);
                  }}
                >
                  {folder.name}
                </span>
              )}
              <Icon
                name={folder.collapsed ? "chevron_right" : "expand_more"}
                size={14}
                color="var(--q-text-light)"
              />
            </div>

            {!folder.collapsed && (
              <>
                <DropZone
                  active={dragging !== null && dropMark?.kind === "folder" && dropMark.folderId === folder.id && dropMark.position === 0}
                  onDragOver={(e) => {
                    if (!draggingRef.current) return;
                    e.preventDefault();
                    setDropMark({ kind: "folder", folderId: folder.id, position: 0 });
                  }}
                  onDrop={(e) => onDropChapter(e, folder.id, 0)}
                />
                {inside.map((c, i) => (
                  <div key={c.id}>
                    <ChapterRow
                      chapter={c}
                      indent={20}
                      active={c.id === activeChapterId}
                      isEditing={editing?.kind === "renameChapter" && editing.id === c.id}
                      draftValue={draft}
                      onDraftChange={setDraft}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      onClick={() => void store.selectChapter(c.id)}
                      onDoubleClick={() => startRenameChapter(c)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenu({ kind: "chapter", id: c.id, x: e.clientX, y: e.clientY });
                      }}
                      dragging={dragging === c.id}
                      onDragStart={(e) => onDragStartChapter(e, c.id)}
                      onDragEnd={onDragEnd}
                    />
                    <DropZone
                      active={dragging !== null && dropMark?.kind === "folder" && dropMark.folderId === folder.id && dropMark.position === i + 1}
                      onDragOver={(e) => {
                        if (!draggingRef.current) return;
                        e.preventDefault();
                        setDropMark({ kind: "folder", folderId: folder.id, position: i + 1 });
                      }}
                      onDrop={(e) => onDropChapter(e, folder.id, i + 1)}
                    />
                  </div>
                ))}
                {editing?.kind === "newChapter" && editing.folderId === folder.id && (
                  <div className="q-books-chapter-row" style={{ paddingLeft: 20 }}>
                    <InlineEdit
                      value={draft}
                      onChange={setDraft}
                      onCommit={commitEdit}
                      onCancel={cancelEdit}
                      placeholder="Nuevo capítulo…"
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Nueva carpeta inline */}
      {editing?.kind === "newFolder" && (
        <div className="q-books-folder-row" style={{ paddingLeft: 12 }}>
          <Icon name="folder" size={12} color="var(--q-text-secondary)" />
          <InlineEdit
            value={draft}
            onChange={setDraft}
            onCommit={commitEdit}
            onCancel={cancelEdit}
            placeholder="Nueva carpeta…"
          />
        </div>
      )}

      {/* Menú contextual */}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
          {menu.kind === "book" && (
            <>
              <MenuItem
                icon="edit"
                label="Renombrar libro"
                onClick={() => {
                  setMenu(null);
                  startRenameBook();
                }}
              />
              <MenuItem
                icon="create_new_folder"
                label="Nueva carpeta"
                onClick={() => {
                  setMenu(null);
                  startNewFolder();
                }}
              />
              <MenuItem
                icon="add"
                label="Nuevo capítulo"
                onClick={() => {
                  setMenu(null);
                  startNewChapter(null);
                }}
              />
              <MenuDivider />
              <MenuItem
                icon="delete"
                label="Borrar libro"
                destructive
                onClick={() => {
                  setMenu(null);
                  setConfirm({
                    title: "Borrar libro",
                    message: `¿Borrar "${book.title}"? Esta acción no se puede deshacer.`,
                    confirmLabel: "Borrar",
                    onConfirm: () => void store.deleteBook(book.id),
                  });
                }}
              />
            </>
          )}
          {menu.kind === "folder" && (
            <>
              <MenuItem
                icon="add"
                label="Nuevo capítulo aquí"
                onClick={() => {
                  setMenu(null);
                  startNewChapter(menu.id);
                }}
              />
              <MenuItem
                icon="edit"
                label="Renombrar carpeta"
                onClick={() => {
                  setMenu(null);
                  const f = folders.find((x) => x.id === menu.id);
                  if (f) startRenameFolder(f);
                }}
              />
              <MenuDivider />
              <MenuItem
                icon="folder_off"
                label="Borrar carpeta"
                destructive
                onClick={() => {
                  const folderId = menu.id;
                  setMenu(null);
                  setConfirm({
                    title: "Borrar carpeta",
                    message: "¿Borrar la carpeta? Los capítulos vuelven a la raíz.",
                    confirmLabel: "Borrar",
                    onConfirm: () => void store.deleteFolder(folderId),
                  });
                }}
              />
            </>
          )}
          {menu.kind === "chapter" && (
            <>
              <MenuItem
                icon="edit"
                label="Renombrar capítulo"
                onClick={() => {
                  setMenu(null);
                  const c = book.chapters.find((x) => x.id === menu.id);
                  if (c) startRenameChapter(c);
                }}
              />
              {activeChapterId && menu.id !== activeChapterId && (
                <MenuItem
                  icon="compare_arrows"
                  label="Comparar con este"
                  onClick={() => {
                    const targetId = menu.id;
                    setMenu(null);
                    void store.openCompareWithChapter(targetId);
                  }}
                />
              )}
              <MenuDivider />
              <MenuItem
                icon="delete"
                label="Borrar capítulo"
                destructive
                onClick={() => {
                  const chapterId = menu.id;
                  setMenu(null);
                  setConfirm({
                    title: "Borrar capítulo",
                    message: "¿Borrar este capítulo? Se elimina el archivo.",
                    confirmLabel: "Borrar",
                    onConfirm: () => void store.deleteChapter(chapterId),
                  });
                }}
              />
            </>
          )}
          {menu.kind === "root" && (
            <>
              <MenuItem
                icon="create_new_folder"
                label="Nueva carpeta"
                onClick={() => {
                  setMenu(null);
                  startNewFolder();
                }}
              />
              <MenuItem
                icon="add"
                label="Nuevo capítulo"
                onClick={() => {
                  setMenu(null);
                  startNewChapter(null);
                }}
              />
            </>
          )}
        </ContextMenu>
      )}

      {/* Confirmación in-app (reemplaza window.confirm, bloqueado en Tauri) */}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          destructive
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

interface ChapterRowProps {
  chapter: Chapter;
  indent: number;
  active: boolean;
  isEditing: boolean;
  draftValue: string;
  onDraftChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  dragging: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  /** Capítulo borrador (sin persistir): se pinta atenuado en cursiva. */
  placeholder?: boolean;
  /** Permite override del drag (el borrador no se arrastra). Default true. */
  draggable?: boolean;
}

function ChapterRow({
  chapter,
  indent,
  active,
  isEditing,
  draftValue,
  onDraftChange,
  onCommit,
  onCancel,
  onClick,
  onDoubleClick,
  onContextMenu,
  dragging,
  onDragStart,
  onDragEnd,
  placeholder = false,
  draggable = true,
}: ChapterRowProps) {
  // Active reduce el padding-left en 2px para compensar el border-left de 2px:
  // así el texto NO se desplaza al activarse (espejando el mockup).
  const paddingLeft = active ? indent - 2 : indent;
  return (
    <div
      className="q-books-chapter-row"
      data-active={active ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      data-placeholder={placeholder ? "true" : undefined}
      draggable={draggable && !isEditing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{ paddingLeft }}
      title="Doble click para renombrar"
    >
      {isEditing ? (
        <InlineEdit
          value={draftValue}
          onChange={onDraftChange}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <>
          <Icon
            name="article"
            size={12}
            className="q-books-chapter-icon"
          />
          <span className="q-books-chapter-title">{chapter.title}</span>
          {!placeholder && <span className="q-books-chapter-words">{chapter.words}</span>}
        </>
      )}
    </div>
  );
}

interface DropZoneProps {
  active: boolean;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

function DropZone({ active, onDragOver, onDrop }: DropZoneProps) {
  return (
    <div
      className="q-books-dropzone"
      data-active={active ? "true" : undefined}
      onDragOver={onDragOver}
      onDrop={onDrop}
    />
  );
}

interface InlineEditProps {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder?: string;
}

function InlineEdit({ value, onChange, onCommit, onCancel, placeholder }: InlineEditProps) {
  return (
    <span style={{ flex: 1, display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
      <TextInput
        value={value}
        onChange={onChange}
        autoFocus
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          else if (e.key === "Escape") onCancel();
        }}
        onBlur={onCommit}
        style={{ height: 22, padding: "0 6px", flex: 1 }}
      />
    </span>
  );
}

// ── Menú contextual ───────────────────────────────────────────────────────────

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
}

function ContextMenu({ x, y, children, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Clamping para no salirse del viewport (estimación: 200×220).
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - 220);
  return (
    <div
      ref={ref}
      className="q-books-context-menu"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

interface MenuItemProps {
  icon: string;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}

function MenuItem({ icon, label, destructive, onClick }: MenuItemProps) {
  const [hover, setHover] = useState(false);
  const color: CSSProperties["color"] = destructive
    ? "var(--q-error)"
    : hover
      ? "var(--q-text-primary)"
      : "var(--q-text-secondary)";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 12px",
        borderRadius: 6,
        fontSize: 12,
        cursor: "default",
        whiteSpace: "nowrap",
        background: hover ? "var(--q-card-hover)" : "transparent",
        color,
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={14} />
      <span>{label}</span>
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "var(--q-border)", margin: "4px 6px" }} />;
}
