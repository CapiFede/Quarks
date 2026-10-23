import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Icon, TextInput, publishSelection, useStoreState } from "@quarks/core";
import type { BooksStore } from "../store";
import { RichEditor } from "./RichEditor";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { TypographyMenu } from "./TypographyMenu";
import { SearchBar } from "./SearchBar";
import { ComparePane } from "./ComparePane";
import { countChars, countWords } from "../util/metrics";
import { useEditorSelection, type SelectionStats } from "../hooks/useEditorSelection";

export interface BookEditorProps {
  store: BooksStore;
}

/**
 * Editor de capítulo: header (título + mini-toolbar markdown + tipografía)
 * + drawer de búsqueda opcional + cuerpo (hoja WYSIWYG continua)
 * + footer (status, paginación, contador de palabras y caracteres).
 */
export function BookEditor({ store }: BookEditorProps) {
  const state = useStoreState(store);
  // Instancia de TipTap del capítulo abierto; la expone `RichEditor` al crearse.
  // La comparte la toolbar (formato) y el contador de selección.
  const [editor, setEditor] = useState<Editor | null>(null);
  // OJO: este hook tiene que vivir ANTES de cualquier early-return. Si lo
  // ponés después, en los renders sin libro/capítulo se saltea y React te
  // tira "Rendered more hooks than during the previous render".
  const selection = useEditorSelection(editor);

  // El capítulo activo puede ser uno real (en `book.chapters`) o el borrador en
  // memoria (libro recién creado / sin capítulos). El borrador todavía no está
  // en disco; se materializa al tipear o renombrar.
  const isDraft =
    !!state.draftChapter && state.draftChapter.id === state.activeChapterId;
  const chapter = isDraft
    ? state.draftChapter
    : state.activeBook?.chapters.find((c) => c.id === state.activeChapterId) ?? null;

  // Espejo de la selección en el bus global (lo consume Quarky). Cuando la
  // selección desaparece publicamos `null`. OJO: el Shell mantiene las panes
  // montadas (`display:none`) al cambiar de tab, así que el cleanup al
  // desmontar NO cubre ese caso: lo cubre `useEditorSelection`, que vacía la
  // selección cuando el editor pierde el foco. El cleanup es para cerrar el tab.
  useEffect(() => {
    if (!selection || !state.activeBook) {
      publishSelection(null);
      return;
    }
    const label = chapter
      ? `Libros · ${state.activeBook.title} · ${chapter.title}`
      : `Libros · ${state.activeBook.title}`;
    publishSelection({ source: "books", text: selection.text, label });
  }, [selection, state.activeBook, chapter]);
  useEffect(() => () => publishSelection(null), []);

  if (!state.activeBook) {
    return (
      <Centered icon="menu_book" title="No hay libro seleccionado">
        Creá un libro desde la toolbar o elegí uno de la lista.
      </Centered>
    );
  }
  if (!chapter) {
    return (
      <Centered icon="article" title="Elegí un capítulo">
        Seleccioná un capítulo del árbol o creá uno nuevo.
      </Centered>
    );
  }

  // Métricas en vivo del contenido en memoria; el cacheado del chapter se
  // actualiza recién al guardar.
  const liveWords = countWords(state.activeContent);
  const liveChars = countChars(state.activeContent);

  // Editor "real" del capítulo abierto. Cuando hay `compare`, este bloque va
  // a la izquierda del split y `ComparePane` ocupa la derecha.
  const leftEditor = (
    <div className="q-books-editor">
      <ChapterHeader
        store={store}
        chapterId={chapter.id}
        chapterTitle={chapter.title}
        placeholder={isDraft}
        editor={editor}
      />
      {state.search.open && <SearchBar store={store} search={state.search} />}
      <RichEditor
        key={chapter.id}
        store={store}
        content={state.activeContent}
        search={state.search}
        chapterScrollTop={chapter.scrollTop ?? 0}
        trim={state.typography.trim}
        typographyKey={`${state.typography.family}|${state.typography.size}|${state.typography.lineHeight}|${state.typography.trim}`}
        onEditorReady={setEditor}
      />
      <StatusFooter
        liveWords={liveWords}
        liveChars={liveChars}
        selection={selection}
        pagination={state.pagination}
        status={state.editorStatus}
        error={state.error}
      />
    </div>
  );

  if (state.compare) {
    return (
      <div className="q-books-split">
        {leftEditor}
        <div className="q-books-split-divider" />
        <ComparePane store={store} compare={state.compare} />
      </div>
    );
  }

  return leftEditor;
}

// ── Header ────────────────────────────────────────────────────────────────────

interface ChapterHeaderProps {
  store: BooksStore;
  chapterId: string;
  chapterTitle: string;
  /** Capítulo borrador: el título va atenuado (es un placeholder). */
  placeholder?: boolean;
  editor: Editor | null;
}

function ChapterHeader({
  store,
  chapterId,
  chapterTitle,
  placeholder = false,
  editor,
}: ChapterHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chapterTitle);

  // Reset del draft cuando el capítulo cambia.
  useEffect(() => {
    setDraft(chapterTitle);
    setEditing(false);
  }, [chapterId, chapterTitle]);

  const commit = () => {
    const v = draft.trim();
    if (v && v !== chapterTitle) void store.renameChapter(chapterId, v);
    setEditing(false);
  };

  return (
    <div className="q-books-editor-header">
      {editing ? (
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={draft}
            onChange={setDraft}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                setDraft(chapterTitle);
                setEditing(false);
              }
            }}
            onBlur={commit}
            style={{ height: 32 }}
          />
        </div>
      ) : (
        <span
          className="q-books-chapter-heading"
          title="Doble click para renombrar"
          onDoubleClick={() => setEditing(true)}
          style={placeholder ? { color: "var(--q-text-light)", fontStyle: "italic" } : undefined}
        >
          {chapterTitle}
        </span>
      )}
      <MarkdownToolbar editor={editor} />
      <TypographyMenu store={store} />
    </div>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

interface StatusFooterProps {
  liveWords: number;
  liveChars: number;
  selection: SelectionStats | null;
  pagination: { current: number; total: number };
  status: "saved" | "dirty" | "saving";
  /** Último error de guardado; el store lo limpia cuando un save sale bien. */
  error: string | null;
}

function StatusFooter({
  liveWords,
  liveChars,
  selection,
  pagination,
  status,
  error,
}: StatusFooterProps) {
  const statusLabel =
    status === "saved" ? "guardado" : status === "saving" ? "guardando…" : "con cambios";
  const statusColor =
    status === "saved"
      ? "var(--q-text-light)"
      : status === "saving"
        ? "var(--q-primary-light)"
        : "var(--q-text-secondary)";

  return (
    <div className="q-books-editor-footer">
      <span className="q-books-footer-slot q-books-footer-left" style={{ color: statusColor }}>
        {statusLabel}
        {error && (
          <span className="q-books-footer-error" title={error}>
            {error}
          </span>
        )}
      </span>
      <span className="q-books-footer-slot q-books-footer-center">
        Pág {pagination.current} / {pagination.total}
      </span>
      <span className="q-books-footer-slot q-books-footer-right">
        {selection
          ? `${selection.words} palabras · ${selection.chars} caracteres seleccionados`
          : `${liveWords} palabras · ${liveChars} caracteres`}
      </span>
    </div>
  );
}

// ── Estados vacíos ────────────────────────────────────────────────────────────

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
        background: "var(--q-background)",
        textAlign: "center",
        padding: "0 24px",
      }}
    >
      <Icon name={icon} size={40} color="var(--q-text-light)" />
      <div style={{ fontSize: 15, color: "var(--q-text-secondary)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--q-text-light)", maxWidth: 320 }}>
        {children}
      </div>
    </div>
  );
}
