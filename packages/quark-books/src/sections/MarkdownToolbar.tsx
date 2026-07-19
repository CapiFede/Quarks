import { IconButton } from "@quarks/core";
import { useEditorState, type Editor } from "@tiptap/react";

export interface MarkdownToolbarProps {
  /** Instancia de TipTap del capítulo abierto (null mientras monta). */
  editor: Editor | null;
}

/**
 * Mini-toolbar de formato: B / I / Encabezado / limpiar formato. Aplica sobre la
 * selección con comandos de TipTap (participan del undo nativo). El `onMouseDown`
 * con `preventDefault` evita que al clickear un botón el editor pierda el foco y
 * la selección. El estado activo (negrita on/off, etc.) sale de `useEditorState`.
 */
export function MarkdownToolbar({ editor }: MarkdownToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      heading: e?.isActive("heading") ?? false,
    }),
  });

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: 2 }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <IconButton
        name="format_bold"
        tooltip="Negrita (Alt+Q)"
        size={13}
        selected={active?.bold}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <IconButton
        name="format_italic"
        tooltip="Cursiva (Alt+E)"
        size={13}
        selected={active?.italic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <IconButton
        name="title"
        tooltip="Encabezado"
        size={13}
        selected={active?.heading}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <IconButton
        name="format_clear"
        tooltip="Quitar formato de la selección"
        size={13}
        onClick={() => editor?.chain().focus().unsetAllMarks().setParagraph().run()}
      />
    </span>
  );
}
