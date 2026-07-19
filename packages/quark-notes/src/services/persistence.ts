/**
 * Persistencia del quark notes.
 *
 * - El ÍNDICE (categorías + metadata por nota) vive en la sección `notes` del
 *   archivo del space (`spaces/<spaceId>.json`), gestionado por el store con
 *   `readSpaceSection`/`writeSpaceSection`.
 * - El CUERPO de cada nota es un `.md` aparte en `packages/notes/<noteId>.md`,
 *   con el mismo patrón atómico (tmp + rename) que usa books para los capítulos.
 *
 * Fuera de Tauri (vista web del core para iterar UI) los `.md` caen a
 * `localStorage` con la misma key, así no rompe ese flow.
 */
import { isTauri } from "@tauri-apps/api/core";

const NOTES_DIR = "packages/notes";
const noteMdPath = (noteId: string) => `${NOTES_DIR}/${noteId}.md`;
const noteTmpPath = (noteId: string) => `${noteMdPath(noteId)}.tmp`;
const lsKey = (rel: string) => `quarks.data.${rel}`;

/** Lee el `.md` de una nota; cadena vacía si no existe. */
export async function readNote(noteId: string): Promise<string> {
  const rel = noteMdPath(noteId);
  if (!isTauri()) {
    return localStorage.getItem(lsKey(rel)) ?? "";
  }
  try {
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(rel, { baseDir: BaseDirectory.AppData }))) return "";
    return await readTextFile(rel, { baseDir: BaseDirectory.AppData });
  } catch {
    return "";
  }
}

// Cola de escrituras por archivo: serializa tmp+rename para que dos saves
// (autosave + flushSave por cambio de nota) no se pisen.
const mdQueues = new Map<string, Promise<void>>();

/** Escribe el cuerpo de una nota de forma atómica (tmp + rename). */
export function writeNote(noteId: string, content: string): Promise<void> {
  const rel = noteMdPath(noteId);
  const prev = mdQueues.get(rel) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeNoteNow(noteId, content));
  mdQueues.set(rel, next);
  void next.finally(() => {
    if (mdQueues.get(rel) === next) mdQueues.delete(rel);
  });
  return next;
}

async function writeNoteNow(noteId: string, content: string): Promise<void> {
  const rel = noteMdPath(noteId);
  if (!isTauri()) {
    localStorage.setItem(lsKey(rel), content);
    return;
  }
  const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  if (!(await exists(NOTES_DIR, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(NOTES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const tmp = noteTmpPath(noteId);
  await writeTextFile(tmp, content, { baseDir: BaseDirectory.AppData });
  await rename(tmp, rel, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

/** Borra el `.md` de una nota (no falla si no existe). */
export async function deleteNote(noteId: string): Promise<void> {
  const rel = noteMdPath(noteId);
  if (!isTauri()) {
    localStorage.removeItem(lsKey(rel));
    return;
  }
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(rel, { baseDir: BaseDirectory.AppData })) {
    await remove(rel, { baseDir: BaseDirectory.AppData });
  }
}
