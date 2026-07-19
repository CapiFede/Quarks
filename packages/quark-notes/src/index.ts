/**
 * Punto de entrada del quark Notas. Exporta la instancia que el registry del
 * core importa y registra (`@quarks/quark-notes`).
 */
import { createNotesQuark } from "./NotesQuark";

export const notesQuark = createNotesQuark();
