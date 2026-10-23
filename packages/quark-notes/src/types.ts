/** Modelos de datos del notes quark. */

/**
 * Referencia liviana de una nota. Vive en `packages/notes/index.json`; el
 * cuerpo va aparte en `packages/notes/<noteId>.md` para no engordar el índice.
 */
export type NoteMode = "text" | "json";

export interface NoteIndex {
  /** UUID estable. Es el nombre del archivo `.md` en disco. */
  id: string;
  title: string;
  /** Primeras palabras del contenido, para mostrar en la lista. */
  preview: string;
  /** Token de color (clave de `NOTE_COLORS`). `null` = neutro. */
  color: string | null;
  /** Modo de edición. `"json"` activa syntax highlight + auto-format. */
  mode: NoteMode;
  /** Si el editor envuelve líneas largas. Relevante sobre todo en modo JSON. */
  wrap: boolean;
  /** Epoch ms de la última edición. Usado para ordenar y mostrar fecha. */
  updatedAt: number;
}

export type EditorStatus = "saved" | "dirty" | "saving";

export type NotesStatus = "idle" | "loading" | "ready" | "error";

/** Snapshot consumido por `useSyncExternalStore`. */
export interface NotesState {
  status: NotesStatus;
  error: string | null;

  notes: NoteIndex[];

  /** Nota abierta en el editor (id + cuerpo). */
  activeNoteId: string | null;
  activeContent: string;
  editorStatus: EditorStatus;

  /** Drawer de búsqueda. */
  searchOpen: boolean;
  search: string;
}
