import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, TextInput, useStoreState, UNTITLED, ConfirmDialog } from "@quarks/core";
import type { NotesStore } from "../store";
import type { NoteIndex } from "../types";
import { colorAccent, colorTint, formatRelativeDate } from "../util";

/** Milisegundos a esperar antes de armar el botón de borrar tras entrar con el mouse. */
const DELETE_ARM_MS = 500;

export interface NotesSidebarProps {
  store: NotesStore;
  /** Notas ya filtradas por búsqueda. */
  visibleNotes: NoteIndex[];
}

/**
 * Sidebar de Notas: barra de búsqueda (cuando está activa) + lista de notas.
 */
export function NotesSidebar({ store, visibleNotes }: NotesSidebarProps) {
  const { notes, activeNoteId, searchOpen, search } = useStoreState(store);
  // Nota pendiente de confirmar borrado (diálogo in-app, reemplaza `window.confirm`).
  const [pendingDelete, setPendingDelete] = useState<NoteIndex | null>(null);

  return (
    <div className="q-notes-sidebar">
      {searchOpen && (
        <div className="q-notes-search">
          <TextInput
            value={search}
            onChange={(v) => store.setSearch(v)}
            placeholder="Buscar en notas…"
            icon="search"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") store.toggleSearch();
            }}
          />
        </div>
      )}
      <div className="q-notes-list">
        <NewNoteItem onClick={() => void store.createNote()} />
        {visibleNotes.length === 0 ? (
          <div className="q-notes-list-empty">
            {notes.length === 0
              ? "Todavía no hay notas en este espacio."
              : "Sin resultados."}
          </div>
        ) : (
          visibleNotes.map((n) => (
            <NoteListItem
              key={n.id}
              note={n}
              active={n.id === activeNoteId}
              onSelect={() => void store.selectNote(n.id)}
              onDelete={() => setPendingDelete(n)}
            />
          ))
        )}
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title="Borrar nota"
          message={`¿Borrar "${pendingDelete.title}"? Esta acción no se puede deshacer.`}
          confirmLabel="Borrar"
          destructive
          onConfirm={() => {
            void store.deleteNote(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/**
 * Item "fantasma" arriba de la lista: borde punteado y contenido centrado.
 * Atajo para crear una nota sin abrir nada (la toolbar superior ya no existe).
 */
function NewNoteItem({ onClick }: { onClick: () => void }) {
  return (
    <div className="q-notes-list-item-add" onClick={onClick} title="Crear nueva nota">
      <span className="q-notes-list-item-add-label">
        <Icon name="add" size={12} />
        Nueva nota
      </span>
    </div>
  );
}

interface NoteListItemProps {
  note: NoteIndex;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function NoteListItem({ note, active, onSelect, onDelete }: NoteListItemProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // `armed` = el botón de borrar puede recibir clicks. Empieza false al entrar
  // con el mouse y pasa a true después de `DELETE_ARM_MS` para evitar borrar
  // por accidente cuando solo estamos pasando por encima del item.
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    wrapRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // Limpia el timer pendiente al desmontar.
  useEffect(() => {
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, []);

  const onMouseEnter = () => {
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(true), DELETE_ARM_MS);
  };
  const onMouseLeave = () => {
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
  };

  // El color de la nota se inyecta via CSS vars:
  //   --q-tint   → fondo (idle + active + hover, layereado por el CSS)
  //   --q-accent → borde izquierdo cuando la nota está activa
  // Para neutral el tint es transparent y el accent cae a `--q-primary`.
  const tint = colorTint(note.color);
  const accent = colorAccent(note.color);
  const style = {
    "--q-tint": tint,
    "--q-accent": accent,
  } as CSSProperties;

  return (
    <div
      ref={wrapRef}
      className="q-notes-list-item"
      data-active={active ? "true" : undefined}
      data-tinted={tint !== "transparent" ? "true" : undefined}
      style={style}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span
        className="q-notes-list-item-delete"
        data-armed={armed ? "true" : undefined}
        title={armed ? "Borrar nota" : "Mantené el mouse encima"}
        onClick={(e) => {
          e.stopPropagation();
          if (!armed) return;
          onDelete();
        }}
      >
        <Icon name="delete" size={14} />
      </span>
      <div className="q-notes-list-item-body">
        <div className="q-notes-list-item-head">
          <span className="q-notes-list-item-title">
            {note.title || UNTITLED}
          </span>
          <span className="q-notes-list-item-date">
            {formatRelativeDate(note.updatedAt)}
          </span>
        </div>
        <div className="q-notes-list-item-preview">
          {note.preview || (
            <span className="q-notes-list-item-preview-empty">Sin contenido</span>
          )}
        </div>
      </div>
    </div>
  );
}
