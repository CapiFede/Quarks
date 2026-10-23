/**
 * Persistencia del quark books.
 *
 * - `book.json` por libro: `readJson`/`writeJson` del core.
 * - `chapter-<id>.md` por capítulo: `readText`/`writeText` del core (atómico +
 *   cola por archivo; fuera de Tauri caen a `localStorage`).
 *
 * Layout en disco bajo `<AppData>/com.quarks.app/`:
 *
 *   packages/books/<bookId>/
 *     ├─ book.json
 *     └─ chapter-<chapterId>.md
 */
import { deleteDir, deleteFile, readJson, readText, writeJson, writeText } from "@quarks/core";
import type { Book } from "../types";

/** Carpeta del libro (relativa a AppData). */
const bookDir = (bookId: string) => `packages/books/${bookId}`;
/** Path relativo del `book.json` de un libro (sin extensión: `writeJson` la agrega). */
const bookJsonKey = (bookId: string) => `${bookDir(bookId)}/book`;
/** Path relativo del `.md` de un capítulo (con extensión). */
const chapterMdPath = (bookId: string, chapterId: string) =>
  `${bookDir(bookId)}/chapter-${chapterId}.md`;

/** Lee `book.json`; devuelve `fallback` si no existe o está corrupto. */
export async function readBook(bookId: string, fallback: Book): Promise<Book> {
  return readJson<Book>(bookJsonKey(bookId), fallback);
}

/** Escribe `book.json` de forma atómica. */
export async function writeBook(book: Book): Promise<void> {
  await writeJson<Book>(bookJsonKey(book.id), book);
}

/**
 * Lee el `.md` de un capítulo; cadena vacía si no existe o falla la lectura
 * (el usuario ve un capítulo en blanco y puede reescribirlo; el book.json no
 * se pierde).
 */
export async function readChapter(bookId: string, chapterId: string): Promise<string> {
  return (await readText(chapterMdPath(bookId, chapterId))) ?? "";
}

/** Escribe un `.md` de capítulo de forma atómica. */
export function writeChapter(bookId: string, chapterId: string, content: string): Promise<void> {
  return writeText(chapterMdPath(bookId, chapterId), content);
}

/** Borra el `.md` de un capítulo (no falla si no existe). */
export function deleteChapter(bookId: string, chapterId: string): Promise<void> {
  return deleteFile(chapterMdPath(bookId, chapterId));
}

/** Borra toda la carpeta del libro (book.json + capítulos). */
export function deleteBook(bookId: string): Promise<void> {
  return deleteDir(bookDir(bookId));
}
