import { useEffect, useState } from "react";
import {
  Icon,
  IconButton,
  QuarkToolbar,
  TextInput,
  useStoreState,
  MenuDivider,
  MenuHint,
  MenuPanel,
  useMenu,
} from "@quarks/core";
import type { BooksStore } from "../store";
import type { BookIndex } from "../types";
import { exportBookToPdf } from "../util/exportPdf";

export interface BooksToolbarProps {
  store: BooksStore;
}

/**
 * Toolbar de Libros. Slot izquierdo = dropdown del libro activo (espejo del
 * mockup: ícono `menu_book` + título + `arrow_drop_down`). Sin slot derecho.
 */
export function BooksToolbar({ store }: BooksToolbarProps) {
  const { books, activeBookId, activeBook } = useStoreState(store);
  const canExport = !!activeBook && activeBook.chapters.length > 0;

  const onExport = async (): Promise<void> => {
    // Flushear cambios pendientes para que el PDF use lo que el usuario ve.
    await store.flushSave();
    const snap = store.getSnapshot();
    if (!snap.activeBook) return;
    await exportBookToPdf(snap.activeBook, snap.typography);
  };

  return (
    <QuarkToolbar
      left={
        <BookSelector
          books={books}
          activeBookId={activeBookId}
          onSelect={(id) => void store.selectBook(id)}
          onCreate={(title) => void store.createBook(title)}
        />
      }
      right={
        canExport ? (
          <IconButton
            name="picture_as_pdf"
            tooltip="Descargar PDF"
            onClick={() => void onExport()}
          />
        ) : null
      }
    />
  );
}

interface BookSelectorProps {
  books: BookIndex[];
  activeBookId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
}

function BookSelector({ books, activeBookId, onSelect, onCreate }: BookSelectorProps) {
  const { open, setOpen, ref } = useMenu<HTMLSpanElement>();
  const [creating, setCreating] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Al cerrarse el menú (click afuera, Escape) se descarta el alta a medias.
  useEffect(() => {
    if (!open) setCreating(false);
  }, [open]);

  const active = books.find((b) => b.id === activeBookId);
  const label = active?.title ?? (books.length === 0 ? "Sin libros" : "Elegí un libro");

  const commitCreate = () => {
    const t = titleDraft.trim();
    if (!t) {
      setCreating(false);
      setOpen(false);
      return;
    }
    onCreate(t);
    setTitleDraft("");
    setCreating(false);
    setOpen(false);
  };

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0 8px",
          height: 24,
          gap: 4,
          borderRadius: 5,
          cursor: "default",
          background: open ? "var(--q-card-hover)" : "transparent",
          transition: "background var(--q-dur-fast) var(--q-ease)",
        }}
      >
        <Icon name="menu_book" size={14} color="var(--q-text-light)" />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: active ? "var(--q-text-primary)" : "var(--q-text-secondary)",
            margin: "0 2px",
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        <Icon name="arrow_drop_down" size={14} color="var(--q-text-light)" />
      </span>

      {open && (
        <MenuPanel minWidth={240}>
          {!creating && (
            <>
              {books.length === 0 && <MenuHint>Todavía no hay libros.</MenuHint>}
              {books.map((b) => (
                <BookOption
                  key={b.id}
                  book={b}
                  active={b.id === activeBookId}
                  onClick={() => {
                    onSelect(b.id);
                    setOpen(false);
                  }}
                />
              ))}
              <MenuDivider />
              <BookOption
                book={{ id: "__new__", title: "Nuevo libro…", author: "" }}
                active={false}
                icon="add"
                onClick={() => setCreating(true)}
              />
            </>
          )}
          {creating && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 6,
              }}
            >
              <TextInput
                value={titleDraft}
                onChange={setTitleDraft}
                placeholder="Título del libro"
                icon="menu_book"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreate();
                  else if (e.key === "Escape") {
                    setCreating(false);
                    setOpen(false);
                  }
                }}
                onBlur={commitCreate}
              />
            </div>
          )}
        </MenuPanel>
      )}
    </span>
  );
}

interface BookOptionProps {
  book: BookIndex;
  active: boolean;
  icon?: string;
  onClick: () => void;
}

function BookOption({ book, active, icon = "menu_book", onClick }: BookOptionProps) {
  const [hover, setHover] = useState(false);
  // El total del libro vive cacheado en `BookIndex` (suma de chapter.words). La
  // primera vez que abrís un libro creado antes de esta versión, viene como
  // `undefined` y el store lo rellena al hacer selectBook. Para no mostrar
  // "0 palabras" mientras tanto, omitimos la línea si no hay info.
  const totals = formatBookTotals(book.words, book.chapterCount);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 32,
        padding: "6px 10px",
        borderRadius: 6,
        cursor: "default",
        background: active
          ? "var(--q-primary-soft-9)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: active ? "var(--q-primary)" : "var(--q-text-primary)",
        fontWeight: active ? 600 : 500,
        fontSize: 12,
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={14} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {book.title}
        </span>
        {totals && (
          <span
            style={{
              fontSize: 10,
              color: "var(--q-text-light)",
              fontWeight: 400,
            }}
          >
            {totals}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Estadística compacta para el dropdown: palabras totales + páginas estimadas.
 * Las páginas son una estimación industrial-standard (~250 palabras / página
 * en novela). Devuelve `null` si no tenemos data cacheada (libro nunca abierto
 * en esta versión).
 */
function formatBookTotals(words?: number, chapterCount?: number): string | null {
  if (words === undefined) return null;
  const w = formatThousands(words);
  const pages = Math.max(1, Math.round(words / 250));
  const parts = [`${w} palabra${words === 1 ? "" : "s"}`, `~${pages} pág.`];
  if (chapterCount !== undefined && chapterCount > 0) {
    parts.push(`${chapterCount} cap.`);
  }
  return parts.join(" · ");
}

/** "12345" → "12.345"; mantiene el formato es-AR con punto como separador de miles. */
function formatThousands(n: number): string {
  return n.toLocaleString("es-AR");
}
