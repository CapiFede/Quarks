/**
 * Persistencia del quark notes.
 *
 * - El ÍNDICE (metadata por nota) vive en `packages/notes/index.json`,
 *   gestionado por el store.
 * - El CUERPO de cada nota es un `.md` aparte en `packages/notes/<noteId>.md`,
 *   escrito con las primitivas de texto del core (atómico + cola por archivo;
 *   fuera de Tauri caen a `localStorage`).
 */
import { deleteFile, readText, writeText } from "@quarks/core";

const noteMdPath = (noteId: string) => `packages/notes/${noteId}.md`;

/** Lee el `.md` de una nota; cadena vacía si no existe. */
export async function readNote(noteId: string): Promise<string> {
  return (await readText(noteMdPath(noteId))) ?? "";
}

/** Escribe el cuerpo de una nota de forma atómica. */
export function writeNote(noteId: string, content: string): Promise<void> {
  return writeText(noteMdPath(noteId), content);
}

/** Borra el `.md` de una nota (no falla si no existe). */
export function deleteNote(noteId: string): Promise<void> {
  return deleteFile(noteMdPath(noteId));
}
