import { useEffect, useMemo, useRef } from "react";
import { Button, Icon, useActiveSpace } from "@quarks/core";
import type { NotesStore } from "../store";
import { useNotesState } from "../hooks/useNotesStore";
import { filterNotes } from "../util";
import { NotesSidebar } from "./NotesSidebar";
import { NoteEditor } from "./NoteEditor";

export interface NotesPageProps {
  store: NotesStore;
}

/**
 * Pantalla única del notes quark: sidebar 260px (lista + búsqueda) + editor flex 1.
 * El space activo se sincroniza con un efecto, mismo patrón que `BooksPage`.
 */
export function NotesPage({ store }: NotesPageProps) {
  const state = useNotesState(store);
  const space = useActiveSpace();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void store.setSpace(space.id);
  }, [store, space.id]);

  // Ctrl/Cmd+F abre el buscador. El Shell mantiene TODAS las panes montadas
  // (las inactivas con `display:none`), así que registramos un listener global
  // y gateamos por visibilidad: `offsetParent === null` ⇒ pane oculta, ignoramos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isFind = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if (!isFind) return;
      if (!rootRef.current?.offsetParent) return; // pane oculta = no nos toca
      e.preventDefault();
      store.toggleSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // Lista visible (filtro de búsqueda).
  const visibleNotes = useMemo(
    () => filterNotes(state.notes, state.search),
    [state.notes, state.search],
  );

  const activeNote = state.activeNoteId
    ? state.notes.find((n) => n.id === state.activeNoteId) ?? null
    : null;

  // Estado vacío total: ni una nota en el space.
  if (state.status === "ready" && state.notes.length === 0) {
    return (
      <div ref={rootRef} className="q-notes-page">
        <Centered icon="edit_note" title="Aún no hay notas en este espacio">
          <div style={{ marginTop: 4 }}>Creá tu primera nota para empezar.</div>
          <Button
            variant="filled"
            icon="add"
            onClick={() => void store.createNote()}
            style={{ marginTop: 8 }}
          >
            Nueva nota
          </Button>
        </Centered>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="q-notes-page">
      <NotesSidebar store={store} visibleNotes={visibleNotes} />
      {activeNote ? (
        <NoteEditor
          store={store}
          note={activeNote}
          content={state.activeContent}
          editorStatus={state.editorStatus}
        />
      ) : (
        <NotesEmpty />
      )}
    </div>
  );
}

function NotesEmpty() {
  return (
    <div className="q-notes-empty">
      <Icon name="note_alt" size={48} color="var(--q-text-light)" />
      <span className="q-notes-empty-hint">Seleccioná una nota</span>
    </div>
  );
}

function Centered({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <Icon name={icon} size={48} color="var(--q-text-light)" />
      <div style={{ fontSize: 15, color: "var(--q-text-secondary)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--q-text-light)" }}>{children}</div>
    </div>
  );
}
