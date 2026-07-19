/**
 * Registro de quarks para el shell.
 *
 * Dos niveles:
 *  - `QUARK_STUBS`: catálogo de metadata (id, nombre, ícono) que alimenta el
 *    launcher del Home y los tabs. Incluye TODOS los quarks, implementados o no.
 *  - `INSTANCES`: las implementaciones reales del contrato `Quark`. Un quark sin
 *    instancia cae al `Placeholder` ("En construcción") al abrirse.
 */
import type { Quark } from "./types";
import { musicQuark } from "@quarks/quark-music";
import { booksQuark } from "@quarks/quark-books";
import { notesQuark } from "@quarks/quark-notes";
import { utilsQuark } from "@quarks/quark-utils";
import { consoleQuark } from "@quarks/quark-console";
import { editorQuark } from "@quarks/quark-editor";

export interface QuarkStub {
  id: string;
  name: string;
  /** Nombre de la ligatura de Material Symbols. */
  icon: string;
  /**
   * Subcarpetas propias del quark dentro de `packages/<id>/`, creadas vacías en el
   * arranque (ver `bootstrap.ts`). El contenido del quark vive ahí.
   */
  dirs?: string[];
}

export const QUARK_STUBS: QuarkStub[] = [
  { id: "music", name: "Música", icon: "music_note", dirs: ["songs", "playlists"] },
  { id: "notes", name: "Notas", icon: "edit_note" },
  { id: "books", name: "Libros", icon: "menu_book" },
  { id: "calendar", name: "Calendario", icon: "calendar_month" },
  { id: "utils", name: "Utilidades", icon: "widgets", dirs: ["system", "system/backups"] },
  { id: "console", name: "Consola", icon: "terminal" },
  { id: "editor", name: "Editor", icon: "content_cut", dirs: ["imports"] },
];

/** Instancias reales, indexadas por id. El id debe coincidir con un stub. */
const INSTANCES: Record<string, Quark> = {
  [musicQuark.id]: musicQuark,
  [booksQuark.id]: booksQuark,
  [notesQuark.id]: notesQuark,
  [utilsQuark.id]: utilsQuark,
  [consoleQuark.id]: consoleQuark,
  [editorQuark.id]: editorQuark,
};

export function getQuark(id: string): QuarkStub | undefined {
  return QUARK_STUBS.find((q) => q.id === id);
}

/** La implementación real del quark, o `undefined` si todavía no existe. */
export function getQuarkInstance(id: string): Quark | undefined {
  return INSTANCES[id];
}
