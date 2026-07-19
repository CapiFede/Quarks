/** Modelos de datos del books quark. */

/**
 * Referencia liviana de un libro dentro del space.
 * Vive en `spaces/<spaceId>.json` bajo la clave `"books"`.
 * El contenido completo (capítulos, carpetas, texto) vive aparte en
 * `packages/books/<id>/`.
 *
 * `words` y `chapterCount` son agregados cacheados que se actualizan al
 * guardar/abrir el libro. Los usa el selector de libros del toolbar para
 * mostrar el tamaño sin tener que cargar cada `book.json` por separado.
 * Pueden faltar en libros viejos (se rellenan la primera vez que abrís el
 * libro en una versión nueva).
 */
export interface BookIndex {
  /** UUID estable. Es el nombre de la carpeta del libro en disco. */
  id: string;
  title: string;
  author: string;
  /** Total de palabras del libro entero (suma de chapter.words). */
  words?: number;
  /** Cantidad de capítulos. */
  chapterCount?: number;
}

/** Documento completo de un libro: `packages/books/<id>/book.json`. */
export interface Book {
  id: string;
  title: string;
  author: string;
  /** Carpetas organizativas; en esta iteración no hay nesting. */
  folders: Folder[];
  /** Lista plana de capítulos; cada uno con `folderId` opcional. */
  chapters: Chapter[];
  /** Último capítulo abierto en el editor (restaurar al re-abrir el libro). */
  lastOpenedChapterId?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  /** Orden dentro del libro (entre carpetas). */
  position: number;
  /** Persistido en disco; default expandida. */
  collapsed?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  /** `null` ⇒ está en la raíz del libro (fuera de toda carpeta). */
  folderId: string | null;
  /** Orden dentro de su grupo (raíz o carpeta). */
  position: number;
  /** Cacheado: recalculado en cada autosave para mostrar en sidebar/footer. */
  words: number;
  /** Posición de scroll guardada al cerrar el capítulo. Restaurada al volver. */
  scrollTop?: number;
}

export type EditorStatus = "saved" | "dirty" | "saving";

/** Familia tipográfica del cuerpo del libro. */
export type BookFontFamily = "serif" | "sans";

/**
 * Ajustes tipográficos de la página del editor. Son una preferencia de lectura
 * GLOBAL (no por libro): se setea una vez y aplica a todos los libros. Se
 * persiste en `localStorage`, no en disco/Drive (es preferencia de dispositivo).
 *
 * Los defaults imitan una novela impresa: serif, ~11pt y interlineado ajustado.
 */
export interface Typography {
  family: BookFontFamily;
  /** Tamaño del cuerpo en px. */
  size: number;
  /** Interlineado (unitless). */
  lineHeight: number;
}

/** Estado del drawer de buscar/reemplazar (scoped al capítulo abierto). */
export interface SearchState {
  open: boolean;
  query: string;
  replace: string;
  /** Match exacto de palabra (con bordes \b). */
  matchWord: boolean;
  /** Toggle case-sensitive (default off). */
  caseSensitive: boolean;
  /** Índice del match "actual" para resaltar; -1 si no hay matches. */
  matchIndex: number;
  /** Total de matches encontrados con la query actual. */
  matchCount: number;
}

export type BooksStatus = "idle" | "loading" | "ready" | "error";

/**
 * Vista comparativa lado-a-lado.
 *   - `user`: el usuario eligió otro capítulo del mismo libro para comparar.
 *     `chapterId` apunta al capítulo de la derecha; `content` es su `.md`.
 *   - `ai`: la IA propuso una reescritura del capítulo abierto. `content` es
 *     el texto propuesto; no hay `chapterId` porque no existe en disco todavía.
 *     `summary` es opcional, el modelo lo manda como nota corta de qué cambió.
 *
 * Solo puede haber UNA comparación activa por vez. Cerrar el split = `null`.
 * Cambiar de capítulo, de libro o de space cierra la comparación
 * automáticamente.
 */
export type CompareState =
  | { mode: "user"; chapterId: string; title: string; content: string }
  | { mode: "ai"; title: string; summary: string | null; content: string };

/** Snapshot consumido por `useSyncExternalStore`. */
export interface BooksState {
  status: BooksStatus;
  error: string | null;

  /** Space activo (segmento de partición del índice). */
  spaceId: string | null;
  /** Libros del space activo (índice liviano). */
  books: BookIndex[];

  /** Libro activo: id + documento cargado. */
  activeBookId: string | null;
  activeBook: Book | null;

  /** Capítulo abierto en el editor. */
  activeChapterId: string | null;
  /**
   * Capítulo "borrador": existe solo en memoria y todavía NO está en disco ni
   * en `activeBook.chapters`. Se usa para que un libro recién creado (o que se
   * quedó sin capítulos) abra directo en una hoja editable sin escribir nada al
   * disco hasta que el usuario tipea o lo renombra. Cuando se materializa pasa a
   * `activeBook.chapters` y este campo vuelve a `null`. Su `id` coincide con
   * `activeChapterId` mientras está activo.
   */
  draftChapter: Chapter | null;
  /** Contenido del .md cargado en memoria; cadena vacía si no hay capítulo. */
  activeContent: string;
  editorStatus: EditorStatus;

  /** Drawer de buscar/reemplazar. */
  search: SearchState;

  /** Paginación visual del editor (página actual / total dentro del capítulo). */
  pagination: { current: number; total: number };

  /** Comparación lado-a-lado activa. `null` cuando el editor está en modo normal. */
  compare: CompareState | null;

  /** Ajustes tipográficos de la página (preferencia global de lectura). */
  typography: Typography;
}
