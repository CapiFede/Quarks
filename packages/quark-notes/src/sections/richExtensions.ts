/**
 * Extensiones del editor rich-text de notas (TipTap v3, mismo motor que
 * quark-books). Centralizadas acá para que `RichTextEditor` quede declarativo.
 *
 * A diferencia de books (markdown como fuente de verdad), las notas persisten
 * HTML: las tablas con headers pintados y el color de texto no tienen
 * representación en CommonMark. El archivo `.md` de la nota es opaco para la
 * persistencia, así que el formato interno puede ser HTML sin tocar el storage.
 */
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";

/**
 * Header/celda de tabla con color de fondo opcional (atributo `backgroundColor`,
 * persistido como style inline). Se aplica con
 * `editor.commands.setCellAttribute("backgroundColor", color)` sobre la(s)
 * celda(s) seleccionada(s). El CSS fuerza texto oscuro cuando hay fondo pastel.
 */
const backgroundColorAttr = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.style.backgroundColor || null,
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs.backgroundColor
        ? { style: `background-color: ${attrs.backgroundColor as string}` }
        : {},
  },
};

const ColorableTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttr };
  },
});

const ColorableTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundColorAttr };
  },
});

/** Construye la lista de extensiones para `useEditor`. */
export function buildNoteExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    TextStyle,
    Color,
    Table.configure({ resizable: false }),
    TableRow,
    ColorableTableHeader,
    ColorableTableCell,
  ];
}
