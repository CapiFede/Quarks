/**
 * Punto de entrada del quark Editor. Exporta la instancia que el registry del
 * core importa y registra (`@quarks/quark-editor`).
 */
import { createEditorQuark } from "./EditorQuark";

export const editorQuark = createEditorQuark();
