/**
 * Store del books quark. Mismo molde que MusicStore: estado + acciones, compartido
 * por toolbar y página vía `useSyncExternalStore`. Vive en la instancia del quark
 * y sobrevive a cambios de tab.
 *
 * Persistencia:
 *   - ÍNDICE de libros (id+title+author) → `packages/books/index.json`.
 *     Liviano: lo lee la sidebar y decide qué cargar.
 *   - CONTENIDO completo de cada libro → `packages/books/<bookId>/book.json` +
 *     un `.md` por capítulo.
 *
 * Autosave: 800ms de debounce; al cambiar de capítulo, de libro o al
 * disponerse, se hace `flushSave()` síncrono para no perder los cambios pendientes.
 */
import {
  readJson,
  writeJson,
  getBookProposal,
  subscribeBookProposal,
  publishBookProposal,
  type LegacySpace,
  ExternalStore,
  clamp,
  newId,
  messageOf,
} from "@quarks/core";
import type {
  Book,
  BookIndex,
  BooksState,
  BooksStatus,
  Chapter,
  CompareState,
  EditorStatus,
  Folder,
  SearchState,
  Typography,
} from "./types";
import {
  deleteBook as deleteBookFiles,
  deleteChapter as deleteChapterFile,
  readBook,
  readChapter,
  writeBook,
  writeChapter,
} from "./services/persistence";
import { countWords } from "./util/metrics";
import { DEFAULT_TRIM, isTrimSize } from "./util/pageGeometry";

/**
 * Operaciones de búsqueda que provee el editor activo. El matcheo, la navegación
 * y el reemplazo los hace la extensión de TipTap (search-and-replace) sobre el
 * documento; el store solo guarda el estado de la UI y delega estas acciones.
 */
export interface SearchOps {
  next: () => void;
  prev: () => void;
  replaceCurrent: () => void;
  replaceAll: () => void;
}

/** Id del quark: clave de su sección en los archivos de la época de los Spaces. */
const QUARK_ID = "books";
/** Índice de libros. */
const INDEX_KEY = "packages/books/index";

interface IndexFile {
  /** Índice liviano: solo lo necesario para listar y abrir libros. */
  books: BookIndex[];
  /** Último libro abierto; se restaura al volver al tab. */
  lastOpenedBookId?: string | null;
}

const AUTOSAVE_MS = 800;

/** Clave de la preferencia tipográfica en localStorage (global, por dispositivo). */
const TYPOGRAPHY_KEY = "quark-books:typography";

/** Defaults estilo novela impresa: serif, 12pt, interlineado ajustado, hoja 6×9″. */
const DEFAULT_TYPOGRAPHY: Typography = {
  family: "serif",
  size: 16,
  lineHeight: 1.45,
  trim: DEFAULT_TRIM,
};

/** Rangos válidos del tamaño de cuerpo y del interlineado. */
export const SIZE_MIN = 13;
export const SIZE_MAX = 22;
const LINE_HEIGHT_MIN = 1.3;
const LINE_HEIGHT_MAX = 2.1;

/** Normaliza un valor crudo (de storage o de la UI) a una Typography válida. */
function sanitizeTypography(raw: unknown): Typography {
  if (typeof raw !== "object" || raw === null) return DEFAULT_TYPOGRAPHY;
  const r = raw as Partial<Typography>;
  const family: Typography["family"] = r.family === "sans" ? "sans" : "serif";
  const size =
    typeof r.size === "number" && Number.isFinite(r.size)
      ? clamp(Math.round(r.size), SIZE_MIN, SIZE_MAX)
      : DEFAULT_TYPOGRAPHY.size;
  const lineHeight =
    typeof r.lineHeight === "number" && Number.isFinite(r.lineHeight)
      ? clamp(r.lineHeight, LINE_HEIGHT_MIN, LINE_HEIGHT_MAX)
      : DEFAULT_TYPOGRAPHY.lineHeight;
  const trim = isTrimSize(r.trim) ? r.trim : DEFAULT_TYPOGRAPHY.trim;
  return { family, size, lineHeight, trim };
}

/** Lee la preferencia tipográfica de localStorage (con fallback a defaults). */
function loadTypography(): Typography {
  try {
    const raw = localStorage.getItem(TYPOGRAPHY_KEY);
    if (!raw) return DEFAULT_TYPOGRAPHY;
    return sanitizeTypography(JSON.parse(raw));
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

const INITIAL_SEARCH: SearchState = {
  open: false,
  query: "",
  replace: "",
  matchWord: false,
  caseSensitive: false,
  matchIndex: -1,
  matchCount: 0,
};

const INITIAL: BooksState = {
  status: "idle",
  error: null,
  books: [],
  activeBookId: null,
  activeBook: null,
  activeChapterId: null,
  draftChapter: null,
  activeContent: "",
  editorStatus: "saved",
  search: INITIAL_SEARCH,
  pagination: { current: 1, total: 1 },
  compare: null,
  typography: loadTypography(),
};

// ── Helpers puros ─────────────────────────────────────────────────────────────

function isValidIndex(r: unknown): r is BookIndex {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as { id: unknown }).id === "string" &&
    typeof (r as { title: unknown }).title === "string" &&
    typeof (r as { author: unknown }).author === "string"
  );
}

/**
 * Migración única desde los Spaces: suma los libros de todos los spaces al
 * índice (los que ya estaban, por id, no se tocan). Si todavía no hay último
 * libro abierto, queda el del primer space (el activo) que tenga uno.
 */
export async function migrateBooksFromSpaces(spaces: LegacySpace[]): Promise<void> {
  const current = await readJson<IndexFile>(INDEX_KEY, { books: [] });
  const byId = new Map(
    (Array.isArray(current.books) ? current.books.filter(isValidIndex) : []).map((b) => [b.id, b]),
  );
  let lastOpenedBookId =
    typeof current.lastOpenedBookId === "string" ? current.lastOpenedBookId : null;
  for (const s of spaces) {
    const section = s.sections[QUARK_ID] as Partial<IndexFile> | undefined;
    const books = Array.isArray(section?.books) ? section.books.filter(isValidIndex) : [];
    for (const b of books) if (!byId.has(b.id)) byId.set(b.id, b);
    if (!lastOpenedBookId && typeof section?.lastOpenedBookId === "string") {
      lastOpenedBookId = section.lastOpenedBookId;
    }
  }
  await writeJson<IndexFile>(INDEX_KEY, { books: [...byId.values()], lastOpenedBookId });
}

/** Título placeholder de un capítulo sin nombrar. */
const UNTITLED_CHAPTER = "Capítulo sin título";

/** Capítulo borrador en memoria (no persistido) para abrir un libro vacío. */
function makeDraftChapter(): Chapter {
  return { id: newId(), title: UNTITLED_CHAPTER, folderId: null, position: 0, words: 0 };
}

/** Reasigna `position` 0..n-1 según el orden actual del array. */
function reposition<T extends { position: number }>(items: T[]): T[] {
  return items.map((it, i) => (it.position === i ? it : { ...it, position: i }));
}

/** Capítulos de una agrupación (raíz o carpeta), ordenados por `position`. */
function chaptersOf(book: Book, folderId: string | null): Chapter[] {
  return book.chapters
    .filter((c) => (c.folderId ?? null) === folderId)
    .sort((a, b) => a.position - b.position);
}

/** Agregados cacheados en `BookIndex` (suma del libro entero). */
function computeBookTotals(book: Book): { words: number; chapterCount: number } {
  let words = 0;
  for (const c of book.chapters) words += c.words;
  return { words, chapterCount: book.chapters.length };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class BooksStore extends ExternalStore<BooksState> {
  constructor() {
    super(INITIAL);
  }

  // Estado fuera del snapshot.
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** El índice ya se leyó de disco. Antes de eso no se escribe (lo pisaría vacío). */
  private loaded = false;
  /** Para descartar resultados viejos cuando se selecciona libro y se cambia
   *  antes de que termine la carga. */
  private bookSeq = 0;
  /** Cleanup de la suscripción al bus de propuestas IA. */
  private unsubProposal: (() => void) | null = null;
  /** Operaciones de búsqueda provistas por el editor activo (ver `SearchOps`). */
  private searchOps: SearchOps | null = null;

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    // Escuchar propuestas IA del bus global: cuando la tool publica una,
    // copiamos al estado interno (que abre el split) y limpiamos el bus.
    this.unsubProposal = subscribeBookProposal(() => this.consumeProposal());
    // Si la tool se ejecutó antes de que montáramos (poco probable), agarrá
    // la propuesta colgada ahora mismo.
    this.consumeProposal();
    await this.loadIndex();
  }

  dispose(): void {
    // Asegurar que cualquier autosave pendiente se grabe antes de cerrar el tab.
    this.cancelAutosave();
    void this.flushSave();
    if (this.unsubProposal) {
      this.unsubProposal();
      this.unsubProposal = null;
    }
  }

  /**
   * Lee el bus de propuestas y, si hay una, abre el split en modo "ai" contra
   * el capítulo abierto. Si no hay capítulo abierto descartamos: la regla de
   * uso de la tool lo prohíbe pero igual no queremos crashear.
   */
  private consumeProposal(): void {
    const p = getBookProposal();
    if (!p) return;
    publishBookProposal(null); // consumimos: la propuesta vive ahora en el store
    const { activeBook, activeChapterId } = this.state;
    if (!activeBook || !activeChapterId) return;
    const chapter = activeBook.chapters.find((c) => c.id === activeChapterId);
    if (!chapter) return;
    const fallbackTitle = `${chapter.title} (propuesta)`;
    const compare: CompareState = {
      mode: "ai",
      title: p.suggestedTitle?.trim() || fallbackTitle,
      summary: p.summary ?? null,
      content: p.content,
    };
    this.set({ compare });
  }

  // Último libro abierto leído del índice; lo guardamos como variable de
  // instancia para poder grabarlo de vuelta al cambiar de libro sin tener que
  // re-leer la sección entera cada vez.
  private lastOpenedBookId: string | null = null;

  // ── Índice de libros ──
  private async loadIndex(): Promise<void> {
    // Si veníamos editando (re-apertura del tab), no perdemos el cambio.
    await this.flushSave();
    this.set({ status: "loading" });
    try {
      const file = await readJson<IndexFile>(INDEX_KEY, { books: [] });
      const books = Array.isArray(file.books) ? file.books.filter(isValidIndex) : [];
      this.lastOpenedBookId =
        typeof file.lastOpenedBookId === "string" ? file.lastOpenedBookId : null;
      this.loaded = true;
      this.set({ books, status: "ready" });
      // Auto-reabrir el último libro si todavía existe.
      const restore =
        this.lastOpenedBookId && books.some((b) => b.id === this.lastOpenedBookId)
          ? this.lastOpenedBookId
          : null;
      if (restore) await this.selectBook(restore);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  private async persistIndex(): Promise<void> {
    if (!this.loaded) return;
    await writeJson<IndexFile>(INDEX_KEY, {
      books: this.state.books,
      lastOpenedBookId: this.lastOpenedBookId,
    });
  }

  // ── Libros ──
  async createBook(title: string, author = ""): Promise<string | null> {
    if (!this.loaded) return null;
    const id = newId();
    const book: Book = {
      id,
      title: title.trim() || "Libro sin título",
      author: author.trim(),
      folders: [],
      chapters: [],
    };
    await writeBook(book);
    const idx: BookIndex = {
      id: book.id,
      title: book.title,
      author: book.author,
      words: 0,
      chapterCount: 0,
    };
    this.set({ books: [...this.state.books, idx] });
    await this.persistIndex();
    await this.selectBook(id);
    return id;
  }

  async renameBook(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    const next = this.state.books.map((b) => (b.id === id ? { ...b, title: trimmed } : b));
    this.set({ books: next });
    await this.persistIndex();
    // Si era el activo, también actualizamos su book.json.
    if (this.state.activeBook?.id === id) {
      const updated: Book = { ...this.state.activeBook, title: trimmed };
      this.set({ activeBook: updated });
      await writeBook(updated);
    } else {
      // No estaba cargado: leer y reescribir el book.json para sincronizar.
      const fallback: Book = { id, title: trimmed, author: "", folders: [], chapters: [] };
      const book = await readBook(id, fallback);
      await writeBook({ ...book, title: trimmed });
    }
  }

  async setBookAuthor(id: string, author: string): Promise<void> {
    const trimmed = author.trim();
    const next = this.state.books.map((b) => (b.id === id ? { ...b, author: trimmed } : b));
    this.set({ books: next });
    await this.persistIndex();
    if (this.state.activeBook?.id === id) {
      const updated: Book = { ...this.state.activeBook, author: trimmed };
      this.set({ activeBook: updated });
      await writeBook(updated);
    }
  }

  async deleteBook(id: string): Promise<void> {
    const wasActive = this.state.activeBookId === id;
    if (wasActive) await this.flushSave();
    const next = this.state.books.filter((b) => b.id !== id);
    this.set({
      books: next,
      ...(wasActive
        ? {
            activeBookId: null,
            activeBook: null,
            activeChapterId: null,
            activeContent: "",
            editorStatus: "saved" as EditorStatus,
          }
        : null),
    });
    await this.persistIndex();
    await deleteBookFiles(id);
  }

  async selectBook(id: string): Promise<void> {
    if (this.state.activeBookId === id) return;
    await this.flushSave();
    const seq = ++this.bookSeq;
    this.set({
      activeBookId: id,
      activeBook: null,
      activeChapterId: null,
      draftChapter: null,
      activeContent: "",
      editorStatus: "saved",
      pagination: { current: 1, total: 1 },
      compare: null,
    });
    const idx = this.state.books.find((b) => b.id === id);
    const fallback: Book = {
      id,
      title: idx?.title ?? "Libro",
      author: idx?.author ?? "",
      folders: [],
      chapters: [],
    };
    const book = await readBook(id, fallback);
    if (seq !== this.bookSeq) return;
    this.set({ activeBook: book });
    // Sincronizar el cache de agregados del índice si está desactualizado o si
    // todavía no se había calculado (libro creado antes de esta versión).
    const totals = computeBookTotals(book);
    if (idx && (idx.words !== totals.words || idx.chapterCount !== totals.chapterCount)) {
      this.set({
        books: this.state.books.map((b) => (b.id === id ? { ...b, ...totals } : b)),
      });
      void this.persistIndex();
    }
    // Persistir como último libro abierto.
    if (this.lastOpenedBookId !== id) {
      this.lastOpenedBookId = id;
      void this.persistIndex();
    }
    // Restaurar el último capítulo si todavía existe, sino el primero visible.
    const desiredChapterId =
      book.lastOpenedChapterId &&
      book.chapters.some((c) => c.id === book.lastOpenedChapterId)
        ? book.lastOpenedChapterId
        : pickFirstChapter(book)?.id ?? null;
    if (desiredChapterId) await this.selectChapter(desiredChapterId);
    else this.openDraftChapter(); // libro sin capítulos: abrir una hoja borrador.
  }

  /**
   * Abre un capítulo borrador (en memoria, sin tocar disco). Lo usa un libro
   * recién creado o uno que se quedó sin capítulos: el editor muestra una hoja
   * editable y recién al tipear/renombrar se materializa a disco.
   */
  private openDraftChapter(): void {
    const draft = makeDraftChapter();
    this.set({
      draftChapter: draft,
      activeChapterId: draft.id,
      activeContent: "",
      editorStatus: "saved",
      pagination: { current: 1, total: 1 },
    });
  }

  /**
   * Pasa el borrador a un capítulo real: lo agrega a `activeBook.chapters`,
   * persiste el `book.json` y limpia `draftChapter`. NO escribe el `.md` (de eso
   * se encarga el autosave/flush con el contenido actual). Devuelve si materializó.
   */
  private materializeDraft(titleOverride?: string): boolean {
    const draft = this.state.draftChapter;
    const book = this.state.activeBook;
    if (!draft || !book) return false;
    const chapter: Chapter = titleOverride
      ? { ...draft, title: titleOverride }
      : draft;
    const next: Book = {
      ...book,
      chapters: [...book.chapters, chapter],
      lastOpenedChapterId: chapter.id,
    };
    this.set({ activeBook: next, draftChapter: null });
    void this.syncIndexTotals(next);
    void writeBook(next);
    return true;
  }

  // ── Carpetas ──
  async createFolder(name: string): Promise<string | null> {
    const book = this.state.activeBook;
    if (!book) return null;
    const id = newId();
    const folder: Folder = {
      id,
      name: name.trim() || "Carpeta",
      position: book.folders.length,
    };
    const next: Book = { ...book, folders: [...book.folders, folder] };
    this.set({ activeBook: next });
    await writeBook(next);
    return id;
  }

  async renameFolder(id: string, name: string): Promise<void> {
    const book = this.state.activeBook;
    if (!book) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: Book = {
      ...book,
      folders: book.folders.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
    };
    this.set({ activeBook: next });
    await writeBook(next);
  }

  async deleteFolder(id: string): Promise<void> {
    const book = this.state.activeBook;
    if (!book) return;
    // Los capítulos de la carpeta vuelven a la raíz; reposicionamos para evitar
    // colisiones con los que ya estaban en raíz.
    const rootChapters = book.chapters.filter((c) => c.folderId === null);
    const released = book.chapters.filter((c) => c.folderId === id);
    const moved = released.map((c, i) => ({
      ...c,
      folderId: null,
      position: rootChapters.length + i,
    }));
    const others = book.chapters.filter((c) => c.folderId !== id && c.folderId !== null);
    const next: Book = {
      ...book,
      folders: reposition(book.folders.filter((f) => f.id !== id)),
      chapters: [...rootChapters, ...moved, ...others],
    };
    this.set({ activeBook: next });
    await writeBook(next);
  }

  toggleFolder(id: string): void {
    const book = this.state.activeBook;
    if (!book) return;
    const next: Book = {
      ...book,
      folders: book.folders.map((f) =>
        f.id === id ? { ...f, collapsed: !f.collapsed } : f,
      ),
    };
    this.set({ activeBook: next });
    // Persistencia silenciosa (no es crítico, pero queda al cerrar la app).
    void writeBook(next);
  }

  // ── Capítulos ──
  async createChapter(folderId: string | null, title: string): Promise<string | null> {
    const book = this.state.activeBook;
    if (!book) return null;
    const id = newId();
    const siblings = book.chapters.filter((c) => (c.folderId ?? null) === folderId);
    const chapter: Chapter = {
      id,
      title: title.trim() || "Capítulo sin título",
      folderId,
      position: siblings.length,
      words: 0,
    };
    const next: Book = { ...book, chapters: [...book.chapters, chapter] };
    this.set({ activeBook: next });
    await this.syncIndexTotals(next);
    await writeBook(next);
    await writeChapter(book.id, id, "");
    await this.selectChapter(id);
    return id;
  }

  async renameChapter(id: string, title: string): Promise<void> {
    const book = this.state.activeBook;
    if (!book) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    // Renombrar la hoja borrador la materializa con ese título (nombrarla ya es
    // intención de conservarla) y graba el `.md` con lo que haya en memoria.
    if (this.state.draftChapter && this.state.draftChapter.id === id) {
      if (this.materializeDraft(trimmed)) await writeChapter(book.id, id, this.state.activeContent);
      return;
    }
    const next: Book = {
      ...book,
      chapters: book.chapters.map((c) => (c.id === id ? { ...c, title: trimmed } : c)),
    };
    this.set({ activeBook: next });
    await writeBook(next);
  }

  async deleteChapter(id: string): Promise<void> {
    if (!this.state.activeBook) return;
    const wasActive = this.state.activeChapterId === id;
    if (wasActive) await this.flushSave();
    // Capturar el libro DESPUÉS del flush: `flushSave` reemplaza `activeBook`
    // con el conteo de palabras actualizado y una copia previa lo pisaría.
    const book = this.state.activeBook;
    if (!book) return;
    const removed = book.chapters.find((c) => c.id === id);
    if (!removed) return;
    // Reposicionar los hermanos para mantener orden compacto.
    const peers = book.chapters
      .filter((c) => (c.folderId ?? null) === (removed.folderId ?? null) && c.id !== id)
      .sort((a, b) => a.position - b.position)
      .map((c, i) => ({ ...c, position: i }));
    const others = book.chapters.filter(
      (c) => (c.folderId ?? null) !== (removed.folderId ?? null),
    );
    const next: Book = { ...book, chapters: [...peers, ...others] };
    this.set({
      activeBook: next,
      ...(wasActive
        ? { activeChapterId: null, activeContent: "", editorStatus: "saved" as EditorStatus }
        : null),
    });
    await this.syncIndexTotals(next);
    await writeBook(next);
    await deleteChapterFile(book.id, id);
    if (wasActive) {
      const fallbackChapter = pickFirstChapter(next);
      if (fallbackChapter) await this.selectChapter(fallbackChapter.id);
      else this.openDraftChapter(); // borramos el último: volver a una hoja borrador.
    }
  }

  async selectChapter(id: string): Promise<void> {
    if (this.state.activeChapterId === id) return;
    if (!this.state.activeBook) return;
    await this.flushSave();
    // Capturar el libro DESPUÉS del flush: `flushSave` reemplaza `activeBook`
    // con el conteo de palabras actualizado; una copia previa lo pisaría en
    // memoria y en disco al grabar `lastOpenedChapterId` más abajo.
    const book = this.state.activeBook;
    if (!book) return;
    const chapter = book.chapters.find((c) => c.id === id);
    if (!chapter) return;
    const content = await readChapter(book.id, id);
    // Mismo cuidado tras la lectura: derivamos del estado actual (pudo haber
    // un rename mientras tanto) y si el libro activo cambió, abandonamos.
    const current = this.state.activeBook;
    if (!current || current.id !== book.id) return;
    // Marcar el capítulo como el último abierto (persistencia ligera).
    if (current.lastOpenedChapterId !== id) {
      const updatedBook: Book = { ...current, lastOpenedChapterId: id };
      this.set({ activeBook: updatedBook });
      void writeBook(updatedBook);
    }
    this.set({
      activeChapterId: id,
      draftChapter: null,
      activeContent: content,
      editorStatus: "saved",
      pagination: { current: 1, total: 1 },
      compare: null,
      search: this.state.search.open
        ? { ...this.state.search, matchIndex: -1, matchCount: 0 }
        : this.state.search,
    });
  }

  /** Actualiza el contador de páginas visible en el footer. */
  setPagination(current: number, total: number): void {
    const safeTotal = Math.max(1, total);
    const safeCurrent = Math.max(1, Math.min(current, safeTotal));
    const prev = this.state.pagination;
    if (prev.current === safeCurrent && prev.total === safeTotal) return;
    this.set({ pagination: { current: safeCurrent, total: safeTotal } });
  }

  /**
   * Guarda la posición de scroll del capítulo activo (in-place en activeBook).
   * No persistimos a disco en cada scroll: el valor se vuelca cuando se cambia
   * de capítulo o se hace flushSave (autosave de contenido).
   */
  rememberScroll(scrollTop: number): void {
    const book = this.state.activeBook;
    const chapterId = this.state.activeChapterId;
    if (!book || !chapterId) return;
    const ch = book.chapters.find((c) => c.id === chapterId);
    if (!ch || ch.scrollTop === scrollTop) return;
    const next: Book = {
      ...book,
      chapters: book.chapters.map((c) => (c.id === chapterId ? { ...c, scrollTop } : c)),
    };
    this.set({ activeBook: next });
  }

  async moveChapter(
    chapterId: string,
    targetFolderId: string | null,
    targetPosition: number,
  ): Promise<void> {
    const book = this.state.activeBook;
    if (!book) return;
    const moved = book.chapters.find((c) => c.id === chapterId);
    if (!moved) return;

    // Quitar el moved de su grupo actual y compactar.
    const fromGroup = book.chapters
      .filter((c) => (c.folderId ?? null) === (moved.folderId ?? null) && c.id !== chapterId)
      .sort((a, b) => a.position - b.position)
      .map((c, i) => ({ ...c, position: i }));

    // Insertar en el grupo destino en `targetPosition` (clamped).
    const toGroupCurrent =
      (moved.folderId ?? null) === (targetFolderId ?? null)
        ? fromGroup
        : book.chapters
            .filter((c) => (c.folderId ?? null) === (targetFolderId ?? null))
            .sort((a, b) => a.position - b.position);
    const insertAt = Math.max(0, Math.min(targetPosition, toGroupCurrent.length));
    const updated = { ...moved, folderId: targetFolderId };
    const toGroup = [
      ...toGroupCurrent.slice(0, insertAt),
      updated,
      ...toGroupCurrent.slice(insertAt),
    ].map((c, i) => ({ ...c, position: i }));

    // Composición: si es el mismo grupo, ya está; si no, mantenemos los demás
    // grupos intactos y reemplazamos los dos afectados.
    let nextChapters: Chapter[];
    if ((moved.folderId ?? null) === (targetFolderId ?? null)) {
      const others = book.chapters.filter(
        (c) => (c.folderId ?? null) !== (moved.folderId ?? null),
      );
      nextChapters = [...toGroup, ...others];
    } else {
      const others = book.chapters.filter(
        (c) =>
          (c.folderId ?? null) !== (moved.folderId ?? null) &&
          (c.folderId ?? null) !== (targetFolderId ?? null),
      );
      nextChapters = [...fromGroup, ...toGroup, ...others];
    }

    const next: Book = { ...book, chapters: nextChapters };
    this.set({ activeBook: next });
    await writeBook(next);
  }

  // ── Editor ──
  // El undo/redo es nativo de TipTap (extensión history de StarterKit): vive en
  // la instancia del editor, no acá. Por eso `updateContent` solo refleja el
  // markdown serializado y agenda el autosave.
  updateContent(text: string): void {
    if (text === this.state.activeContent) return;
    // Primer contenido real en una hoja borrador: la materializamos a disco.
    if (this.state.draftChapter && text.trim() !== "") this.materializeDraft();
    this.set({ activeContent: text, editorStatus: "dirty" });
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    this.cancelAutosave();
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, AUTOSAVE_MS);
  }

  private cancelAutosave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /** Forzar guardar lo pendiente AHORA (cambio de cap, re-apertura, dispose). */
  async flushSave(): Promise<void> {
    this.cancelAutosave();
    const { activeBook, activeChapterId, activeContent, editorStatus } = this.state;
    if (!activeBook) return;
    // Sin cambios de contenido: igual persistimos el book.json para que el
    // scrollTop y lastOpenedChapterId sobrevivan a cerrar la app sin tocar nada.
    if (!activeChapterId || editorStatus === "saved") {
      await writeBook(activeBook);
      return;
    }
    this.set({ editorStatus: "saving" });
    try {
      await writeChapter(activeBook.id, activeChapterId, activeContent);
      // Derivar del estado ACTUAL, no de la copia previa al await: mientras se
      // escribía pudieron renombrarse capítulos/carpetas y no queremos pisarlos.
      // Si el libro activo cambió, quien lo cambió ya reseteó el editor.
      const current = this.state.activeBook;
      if (!current || current.id !== activeBook.id) return;
      // Actualizar word count cacheado del capítulo.
      const words = countWords(activeContent);
      const updatedBook: Book = {
        ...current,
        chapters: current.chapters.map((c) =>
          c.id === activeChapterId ? { ...c, words } : c,
        ),
      };
      // Recalcular agregados y sincronizar la entrada del índice si cambiaron
      // (palabras del capítulo nuevas, count de capítulos no cambia acá pero
      // por las dudas también).
      const totals = computeBookTotals(updatedBook);
      const prevIdx = this.state.books.find((b) => b.id === activeBook.id);
      const indexChanged =
        prevIdx &&
        (prevIdx.words !== totals.words || prevIdx.chapterCount !== totals.chapterCount);
      this.set({
        activeBook: updatedBook,
        // Si se tipeó durante la escritura, lo grabado ya es viejo: queda
        // "dirty" para que el autosave pendiente lo vuelva a bajar.
        editorStatus: this.state.activeContent === activeContent ? "saved" : "dirty",
        error: null,
        ...(indexChanged
          ? {
              books: this.state.books.map((b) =>
                b.id === activeBook.id ? { ...b, ...totals } : b,
              ),
            }
          : null),
      });
      await writeBook(updatedBook);
      if (indexChanged) await this.persistIndex();
    } catch (e) {
      // No revertimos el contenido en memoria: el usuario sigue editando lo suyo.
      this.set({ editorStatus: "dirty", error: messageOf(e) });
    }
  }

  /**
   * Sincroniza la entrada del `BookIndex` con los agregados (palabras totales
   * y cantidad de capítulos) calculados a partir del libro pasado. Persiste el
   * índice solo si cambió, para no escribir disco gratis.
   */
  private async syncIndexTotals(book: Book): Promise<void> {
    const totals = computeBookTotals(book);
    const prev = this.state.books.find((b) => b.id === book.id);
    if (!prev) return;
    if (prev.words === totals.words && prev.chapterCount === totals.chapterCount) return;
    this.set({
      books: this.state.books.map((b) => (b.id === book.id ? { ...b, ...totals } : b)),
    });
    await this.persistIndex();
  }

  // ── Búsqueda / reemplazo ──
  // El matcheo, la navegación y el reemplazo los hace la extensión del editor; el
  // store solo guarda el estado de la UI y delega vía `searchOps`. El editor
  // refleja su estado (conteo + índice activo) con `reportSearch`.
  attachSearchOps(ops: SearchOps): void {
    this.searchOps = ops;
  }

  detachSearchOps(): void {
    this.searchOps = null;
  }

  /** El editor refleja cuántos matches hay y cuál es el activo (0-based, -1 si 0). */
  reportSearch(count: number, index: number): void {
    const prev = this.state.search;
    const matchIndex = count === 0 ? -1 : Math.min(Math.max(index, 0), count - 1);
    if (prev.matchCount === count && prev.matchIndex === matchIndex) return;
    this.set({ search: { ...prev, matchCount: count, matchIndex } });
  }

  toggleSearch(): void {
    const wasOpen = this.state.search.open;
    if (wasOpen) {
      // Cerrar = limpiar query y matches.
      this.set({ search: { ...INITIAL_SEARCH, replace: this.state.search.replace } });
    } else {
      this.set({ search: { ...this.state.search, open: true } });
    }
  }

  // El conteo y el índice activo los refleja el editor (`reportSearch`); estos
  // setters solo guardan la entrada de la UI, el editor reacciona al cambio.
  setSearchQuery(query: string): void {
    this.set({ search: { ...this.state.search, query } });
  }

  setReplaceQuery(replace: string): void {
    this.set({ search: { ...this.state.search, replace } });
  }

  setMatchWord(matchWord: boolean): void {
    this.set({ search: { ...this.state.search, matchWord } });
  }

  setCaseSensitive(caseSensitive: boolean): void {
    this.set({ search: { ...this.state.search, caseSensitive } });
  }

  /** Navega al match siguiente/anterior (lo mueve la extensión del editor). */
  nextMatch(): void {
    if (this.state.search.matchCount === 0) return;
    this.searchOps?.next();
  }

  prevMatch(): void {
    if (this.state.search.matchCount === 0) return;
    this.searchOps?.prev();
  }

  /** Reemplaza el match actual por `search.replace` (lo aplica el editor). */
  replaceOne(): void {
    if (this.state.search.matchIndex < 0) return;
    this.searchOps?.replaceCurrent();
  }

  /** Reemplaza todos los matches por `search.replace` (lo aplica el editor). */
  replaceAllMatches(): void {
    if (this.state.search.matchCount === 0) return;
    this.searchOps?.replaceAll();
  }

  // ── Tipografía (preferencia global de lectura) ──
  /**
   * Aplica un parche a los ajustes tipográficos y lo persiste en localStorage.
   * Los valores se normalizan/clampean a los rangos válidos. El re-render
   * dispara el recálculo de paginación en `RichEditor` (la altura de cada
   * página cambia con la fuente/tamaño/interlineado/formato).
   */
  setTypography(patch: Partial<Typography>): void {
    const next = sanitizeTypography({ ...this.state.typography, ...patch });
    const prev = this.state.typography;
    if (
      prev.family === next.family &&
      prev.size === next.size &&
      prev.lineHeight === next.lineHeight &&
      prev.trim === next.trim
    ) {
      return;
    }
    this.set({ typography: next });
    try {
      localStorage.setItem(TYPOGRAPHY_KEY, JSON.stringify(next));
    } catch {
      /* localStorage lleno o no disponible: el cambio igual vive en memoria. */
    }
  }

  // ── Comparación lado-a-lado ──
  /**
   * Abre el split contra `otherChapterId` (mismo libro). El capítulo abierto
   * queda a la izquierda (editor real); el target va a la derecha (read-only).
   * Si el target es el capítulo abierto, no hacemos nada.
   */
  async openCompareWithChapter(otherChapterId: string): Promise<void> {
    const { activeBook, activeChapterId } = this.state;
    if (!activeBook || !activeChapterId) return;
    if (otherChapterId === activeChapterId) return;
    const target = activeBook.chapters.find((c) => c.id === otherChapterId);
    if (!target) return;
    // Forzamos guardar lo pendiente del izquierdo antes de cargar el target.
    // Sin esto, si el usuario tiene cambios sin grabar y abrimos compare en el
    // mismo libro, no hay riesgo (el editor sigue funcionando), pero
    // simplificamos el modelo mental.
    await this.flushSave();
    const content = await readChapter(activeBook.id, otherChapterId);
    this.set({
      compare: {
        mode: "user",
        chapterId: otherChapterId,
        title: target.title,
        content,
      },
    });
  }

  /** Cierra el split (manual o IA). */
  closeCompare(): void {
    if (!this.state.compare) return;
    this.set({ compare: null });
  }

  /**
   * Aplica la propuesta IA al capítulo abierto (pisa el contenido). Solo
   * válido cuando `compare.mode === "ai"`. Cierra el split al terminar.
   */
  async replaceWithProposal(): Promise<void> {
    const c = this.state.compare;
    if (!c || c.mode !== "ai") return;
    if (!this.state.activeBook || !this.state.activeChapterId) return;
    this.set({
      activeContent: c.content,
      editorStatus: "dirty",
      compare: null,
    });
    await this.flushSave();
  }

  /**
   * Crea un capítulo NUEVO con el contenido propuesto, en el mismo grupo
   * (raíz o carpeta) que el capítulo abierto, justo después de él. Cierra
   * el split y selecciona el nuevo. Solo válido cuando `compare.mode === "ai"`.
   */
  async acceptProposalAsNewChapter(): Promise<void> {
    const c = this.state.compare;
    if (!c || c.mode !== "ai") return;
    const book = this.state.activeBook;
    const currentId = this.state.activeChapterId;
    if (!book || !currentId) return;
    const current = book.chapters.find((ch) => ch.id === currentId);
    if (!current) return;
    // Insertamos en el mismo grupo, justo después del actual. Reposicionamos
    // los hermanos posteriores para mantener `position` compacto.
    const newChapterId = newId();
    const folderId = current.folderId ?? null;
    const inserted: Chapter = {
      id: newChapterId,
      title: c.title.trim() || `${current.title} (propuesta)`,
      folderId,
      position: current.position + 1,
      words: countWords(c.content),
    };
    const peers = book.chapters
      .filter((ch) => (ch.folderId ?? null) === folderId)
      .sort((a, b) => a.position - b.position);
    const idxOfCurrent = peers.findIndex((ch) => ch.id === currentId);
    const before = peers.slice(0, idxOfCurrent + 1);
    const after = peers.slice(idxOfCurrent + 1).map((ch) => ({
      ...ch,
      position: ch.position + 1,
    }));
    const others = book.chapters.filter((ch) => (ch.folderId ?? null) !== folderId);
    const next: Book = {
      ...book,
      chapters: [...before, inserted, ...after, ...others],
    };
    // Cerramos el compare antes de cargar el nuevo capítulo (selectChapter
    // también lo cerraría, pero acá lo dejamos explícito).
    this.set({ activeBook: next, compare: null });
    await this.syncIndexTotals(next);
    await writeBook(next);
    await writeChapter(book.id, newChapterId, c.content);
    await this.selectChapter(newChapterId);
  }
}

/** Selecciona el primer capítulo en orden visual (raíz, luego cada carpeta). */
function pickFirstChapter(book: Book): Chapter | null {
  const root = chaptersOf(book, null);
  if (root[0]) return root[0];
  const folders = [...book.folders].sort((a, b) => a.position - b.position);
  for (const f of folders) {
    const inside = chaptersOf(book, f.id);
    if (inside[0]) return inside[0];
  }
  return null;
}

/** Util público para que la página pueda re-derivar grupos sin duplicar lógica. */
export function chaptersInGroup(book: Book, folderId: string | null): Chapter[] {
  return chaptersOf(book, folderId);
}

// Re-exportamos el status como type para que la UI pueda tiparlo sin importar
// types.ts directamente cuando no lo necesita.
export type { BooksState, BooksStatus };
