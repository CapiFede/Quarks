import { Icon, type AiContext, type Quark } from "@quarks/core";
import { BooksStore } from "./store";
import { BooksPage } from "./sections/BooksPage";
import { BooksToolbar } from "./sections/BooksToolbar";
import "./styles/books.css";

/**
 * Implementación del contrato `Quark` para Libros.
 * Mantiene un `BooksStore` propio que la toolbar y la página comparten via
 * `useSyncExternalStore`. El Shell llama `initialize()` al abrir el tab y
 * `dispose()` al cerrarlo (flush del autosave incluido).
 */
export function createBooksQuark(): Quark {
  const store = new BooksStore();

  return {
    id: "books",
    name: "Libros",
    icon: <Icon name="menu_book" size={16} />,

    buildPage: () => <BooksPage store={store} />,
    buildToolbar: () => <BooksToolbar store={store} />,

    onEscape: () => {
      if (store.getSnapshot().search.open) {
        store.toggleSearch();
        return true;
      }
      return false;
    },

    buildAiContext: () => buildBooksAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}

/**
 * Snapshot que el quark Libros le pasa a Quarky cada turno:
 *   - `instructions`: dónde está parado el usuario (libro/cap activos, listado
 *     del libro actual). Trusted.
 *   - `attachments`: el contenido del capítulo abierto. Untrusted.
 *
 * Si no hay libro abierto, devolvemos null — el system prompt se compone sin
 * inyección del quark y la IA se entera por el `contexts/books.md`.
 */
function buildBooksAiContext(store: BooksStore): AiContext | null {
  const s = store.getSnapshot();
  if (!s.activeBook) {
    if (s.books.length === 0) return null;
    return {
      instructions:
        "Estás en el quark Libros. El usuario todavía no abrió ningún libro. " +
        `Libros disponibles en este space: ${s.books
          .map((b) => `"${b.title}"`)
          .join(", ")}.`,
    };
  }
  const book = s.activeBook;
  const chapter = book.chapters.find((c) => c.id === s.activeChapterId) ?? null;

  // Listado compacto de capítulos para que la IA pueda referirse a otros
  // capítulos sin abrir el archivo entero ("¿qué sigue después del 3?", etc.).
  const chapterList = [...book.chapters]
    .sort((a, b) => a.position - b.position)
    .map((c, i) => {
      const marker = c.id === s.activeChapterId ? " (abierto)" : "";
      return `${i + 1}. ${c.title}${marker}`;
    })
    .join("\n");

  const headerLines = [
    "Estás en el quark Libros (editor de libros markdown por capítulos).",
    `Libro abierto: "${book.title}"${book.author ? ` — ${book.author}` : ""}.`,
    chapter
      ? `Capítulo abierto: "${chapter.title}" (${chapter.words} palabras).`
      : "El usuario no tiene ningún capítulo abierto.",
  ];
  if (book.chapters.length > 0) {
    headerLines.push("", "Índice del libro:", chapterList);
  }
  // Las reglas de uso de la tool (cuándo sí / cuándo no / formato) viven en su
  // `description` de schema (`tools/builtin/proposeChapterRewrite.ts`), que es lo
  // que ve el modelo en cada llamada. No las duplicamos acá. Solo avisamos cuando
  // NO está disponible (no hay capítulo abierto) porque es accionable.
  if (!chapter) {
    headerLines.push(
      "",
      "La tool `propose_chapter_rewrite` no está disponible: no hay capítulo abierto. Si el usuario pide reescribir algo, pedile que abra el capítulo primero.",
    );
  }

  const attachments = chapter
    ? [
        {
          label: `CAPÍTULO_ABIERTO:${chapter.title}`,
          content: s.activeContent,
        },
      ]
    : [];

  return {
    instructions: headerLines.join("\n"),
    attachments,
  };
}
