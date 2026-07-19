/**
 * Render markdown → HTML para vistas de SOLO LECTURA (export a PDF y panel de
 * comparación). Usa `marked`, el mismo parser que `@tiptap/markdown` integra en
 * el editor, así hay un único dialecto de markdown en todo el proyecto (el
 * editor es la fuente de verdad del `.md`; acá solo lo renderizamos).
 *
 * El editor mismo NO usa esto: parsea/serializa markdown con `@tiptap/markdown`.
 */
import { marked } from "marked";

/** Markdown → HTML (string). Síncrono y sin estado compartido. */
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
}
