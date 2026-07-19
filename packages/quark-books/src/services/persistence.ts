/**
 * Persistencia del quark books.
 *
 * - `book.json` por libro: `readJson`/`writeJson` del core (escritura atómica + cola por archivo).
 * - `chapter-<id>.md` por capítulo: archivo de texto plano. Mismo patrón atómico
 *   (tmp + rename) con `@tauri-apps/plugin-fs`, replicado acá para no exponer
 *   binary helpers desde la superficie pública del core.
 *
 * Layout en disco bajo `<AppData>/com.quarks.app/`:
 *
 *   packages/books/<bookId>/
 *     ├─ book.json
 *     └─ chapter-<chapterId>.md
 *
 * Fuera de Tauri (vista web del core para iterar UI) los `.md` caen a
 * `localStorage` con la misma key, así no rompe ese flow.
 */
import { readJson, writeJson } from "@quarks/core";
import { isTauri } from "@tauri-apps/api/core";
import type { Book } from "../types";

/** Path relativo del `book.json` de un libro (sin extensión: `writeJson` la agrega). */
const bookJsonKey = (bookId: string) => `packages/books/${bookId}/book`;
/** Path relativo del `.md` de un capítulo (con extensión). */
const chapterMdPath = (bookId: string, chapterId: string) =>
  `packages/books/${bookId}/chapter-${chapterId}.md`;
const chapterTmpPath = (bookId: string, chapterId: string) =>
  `${chapterMdPath(bookId, chapterId)}.tmp`;
/** Carpeta del libro (relativa a AppData). */
const bookDir = (bookId: string) => `packages/books/${bookId}`;
const lsKey = (rel: string) => `quarks.data.${rel}`;

/** Lee `book.json`; devuelve `fallback` si no existe o está corrupto. */
export async function readBook(bookId: string, fallback: Book): Promise<Book> {
  return readJson<Book>(bookJsonKey(bookId), fallback);
}

/** Escribe `book.json` de forma atómica. */
export async function writeBook(book: Book): Promise<void> {
  await writeJson<Book>(bookJsonKey(book.id), book);
}

/** Lee el `.md` de un capítulo; cadena vacía si no existe. */
export async function readChapter(bookId: string, chapterId: string): Promise<string> {
  const rel = chapterMdPath(bookId, chapterId);
  if (!isTauri()) {
    return localStorage.getItem(lsKey(rel)) ?? "";
  }
  try {
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(rel, { baseDir: BaseDirectory.AppData }))) return "";
    return await readTextFile(rel, { baseDir: BaseDirectory.AppData });
  } catch {
    // Si el archivo está corrupto / IO falla, devolvemos vacío. El usuario verá
    // un capítulo en blanco y puede reescribirlo (no perdemos el book.json).
    return "";
  }
}

// Cola de escrituras por archivo: serializa tmp+rename para que dos saves
// (autosave + flushSave por cambio de tab, p. ej.) no se pisen.
const mdQueues = new Map<string, Promise<void>>();

/** Escribe un `.md` de capítulo de forma atómica (tmp + rename). */
export function writeChapter(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const rel = chapterMdPath(bookId, chapterId);
  const prev = mdQueues.get(rel) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeChapterNow(bookId, chapterId, content));
  mdQueues.set(rel, next);
  void next.finally(() => {
    if (mdQueues.get(rel) === next) mdQueues.delete(rel);
  });
  return next;
}

async function writeChapterNow(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<void> {
  const rel = chapterMdPath(bookId, chapterId);
  if (!isTauri()) {
    localStorage.setItem(lsKey(rel), content);
    return;
  }
  const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  const dir = bookDir(bookId);
  if (!(await exists(dir, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const tmp = chapterTmpPath(bookId, chapterId);
  await writeTextFile(tmp, content, { baseDir: BaseDirectory.AppData });
  await rename(tmp, rel, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

/** Borra el `.md` de un capítulo (no falla si no existe). */
export async function deleteChapter(bookId: string, chapterId: string): Promise<void> {
  const rel = chapterMdPath(bookId, chapterId);
  if (!isTauri()) {
    localStorage.removeItem(lsKey(rel));
    return;
  }
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(rel, { baseDir: BaseDirectory.AppData })) {
    await remove(rel, { baseDir: BaseDirectory.AppData });
  }
}

/** Borra toda la carpeta del libro (book.json + capítulos). */
export async function deleteBook(bookId: string): Promise<void> {
  if (!isTauri()) {
    // En el flow browser, removemos cualquier key que cuelgue del libro.
    const prefix = `quarks.data.packages/books/${bookId}/`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
    return;
  }
  const dir = bookDir(bookId);
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(dir, { baseDir: BaseDirectory.AppData })) {
    await remove(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}
