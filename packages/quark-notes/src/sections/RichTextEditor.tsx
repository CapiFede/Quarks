import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { buildNoteExtensions } from "./richExtensions";
import { looksLikeHtml } from "../util";

/**
 * Editor rich-text de la nota activa (modo texto) sobre TipTap v3. El HTML es
 * la fuente de verdad en disco (ver `richExtensions.ts`); las notas viejas en
 * texto plano se convierten al vuelo a párrafos (el archivo recién se reescribe
 * como HTML cuando el usuario edita).
 *
 * Se monta con `key={noteId}` desde `NoteEditor`, así cada nota arranca con un
 * editor (e historial de undo) limpio. El contenido llega async (el store lee
 * el .md al seleccionar): los cambios EXTERNOS del prop entran por `setContent`
 * comparando contra lo último que emitimos, igual que en books.
 */
export interface RichTextEditorProps {
  /** Cuerpo de la nota (HTML, o texto plano legacy). */
  content: string;
  /** Emite el HTML actualizado en cada edición (va al autosave del store). */
  onUpdate: (html: string) => void;
  /** Expone la instancia de TipTap al padre (barra de formato). */
  onEditorReady: (editor: Editor | null) => void;
}

/** `editorProps` estable: identidad constante para no reconfigurar el editor. */
const EDITOR_PROPS = {
  attributes: { class: "q-notes-prose", spellcheck: "true" },
};

/** Escapa texto para incrustarlo en HTML. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Texto plano legacy → párrafos HTML (una línea = un <p>, vacías incluidas). */
function plainTextToHtml(text: string): string {
  if (!text.trim()) return "";
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : "<p></p>"))
    .join("");
}

/** Contenido del disco → HTML apto para el editor. */
function toEditorHtml(content: string): string {
  return looksLikeHtml(content) ? content : plainTextToHtml(content);
}

export function RichTextEditor({ content, onUpdate, onEditorReady }: RichTextEditorProps) {
  /** Último contenido que EMITIMOS o recibimos: distingue ediciones propias. */
  const lastSeenRef = useRef(content);

  const extensions = useMemo(() => buildNoteExtensions(), []);
  const [initialContent] = useState(() => toEditorHtml(content));

  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps: EDITOR_PROPS,
    onCreate: ({ editor }) => {
      lastSeenRef.current = content;
      onEditorReady(editor);
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (html === lastSeenRef.current) return;
      lastSeenRef.current = html;
      onUpdate(html);
    },
  });

  // Limpiar la instancia expuesta al desmontar (cambio de nota remonta por key).
  useEffect(() => {
    return () => onEditorReady(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios EXTERNOS del contenido (carga async al seleccionar la nota).
  useEffect(() => {
    if (!editor) return;
    if (content === lastSeenRef.current) return;
    lastSeenRef.current = content;
    editor.commands.setContent(toEditorHtml(content), { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content]);

  return <EditorContent editor={editor} className="q-notes-rich" />;
}
