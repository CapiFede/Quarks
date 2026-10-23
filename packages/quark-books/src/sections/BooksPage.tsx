import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon, TextInput, useStoreState } from "@quarks/core";
import type { BooksStore } from "../store";
import type { Typography } from "../types";
import { BookSidebar } from "./BookSidebar";
import { BookEditor } from "./BookEditor";

/**
 * Variables CSS de la tipografía de la página. Se setean en la raíz del quark
 * para que las hereden tanto el editor como la vista comparativa (`.q-books-prose`
 * las consume). Cambiarlas re-renderiza y dispara el recálculo de paginación.
 */
function typographyVars(t: Typography): CSSProperties {
  return {
    "--q-books-font-family": t.family === "sans" ? "var(--q-font-sans)" : "var(--q-font-serif)",
    "--q-books-font-size": `${t.size}px`,
    "--q-books-line-height": String(t.lineHeight),
  } as CSSProperties;
}

export interface BooksPageProps {
  store: BooksStore;
}

/** Pantalla única del books quark: sidebar 240px + editor flex 1. */
export function BooksPage({ store }: BooksPageProps) {
  const state = useStoreState(store);
  const rootRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd+F abre el buscador del capítulo. Mismo patrón que en notes: el
  // Shell mantiene TODAS las panes montadas (las inactivas con `display:none`),
  // así que registramos un listener global y gateamos por visibilidad
  // (`offsetParent === null` ⇒ pane oculta, ignoramos). Solo con capítulo
  // abierto: sin él `BookEditor` no renderiza la `SearchBar`.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isFind = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if (!isFind) return;
      if (!rootRef.current?.offsetParent) return; // pane oculta = no nos toca
      const s = store.getSnapshot();
      if (!s.activeBook || !s.activeChapterId) return;
      e.preventDefault();
      store.toggleSearch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  // Estado vacío: sin libros. Se crea inline desde el sidebar
  // (treeview), sin popups del sistema.
  if (state.books.length === 0 && state.status === "ready") {
    return (
      <div ref={rootRef} className="q-books-page" style={typographyVars(state.typography)}>
        <EmptyBooksSidebar store={store} />
        <BookEditor store={store} />
      </div>
    );
  }

  return (
    <div ref={rootRef} className="q-books-page" style={typographyVars(state.typography)}>
      {state.activeBook ? (
        <BookSidebar
          store={store}
          book={state.activeBook}
          activeChapterId={state.activeChapterId}
          draftChapter={state.draftChapter}
        />
      ) : (
        <div className="q-books-sidebar">
          <SidebarEmpty />
        </div>
      )}
      <BookEditor store={store} />
    </div>
  );
}

/**
 * Sidebar del estado "todavía no hay libros": una fila para crear el primer
 * libro inline (igual que crear un capítulo en el árbol). Sin autor: se nombra
 * y listo.
 */
function EmptyBooksSidebar({ store }: { store: BooksStore }) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const title = draft.trim();
    setCreating(false);
    setDraft("");
    if (title) void store.createBook(title);
  };

  return (
    <div className="q-books-sidebar">
      {creating ? (
        <div className="q-books-chapter-row" style={{ paddingLeft: 12 }}>
          <Icon name="menu_book" size={12} color="var(--q-text-secondary)" />
          <span style={{ flex: 1, display: "inline-flex" }}>
            <TextInput
              value={draft}
              onChange={setDraft}
              autoFocus
              placeholder="Título del libro…"
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                else if (e.key === "Escape") {
                  setCreating(false);
                  setDraft("");
                }
              }}
              onBlur={commit}
              style={{ height: 22, padding: "0 6px", flex: 1 }}
            />
          </span>
        </div>
      ) : (
        <div
          className="q-books-new-book-row"
          onClick={() => setCreating(true)}
          title="Crear el primer libro"
        >
          <Icon name="add" size={14} color="var(--q-text-secondary)" />
          <span>Nuevo libro</span>
        </div>
      )}
    </div>
  );
}

function SidebarEmpty() {
  return (
    <div
      style={{
        padding: "20px 16px",
        color: "var(--q-text-light)",
        fontSize: 11,
        textAlign: "center",
      }}
    >
      Elegí un libro del menú de la izquierda.
    </div>
  );
}
