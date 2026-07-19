/**
 * Lista de extensiones del editor de capítulos (TipTap v3). Centralizada acá
 * para que `RichEditor` quede chico y declarativo.
 *
 * Motor: ProseMirror vía TipTap. El undo/redo es el nativo (`UndoRedo` de
 * StarterKit); el markdown lo serializa `@tiptap/markdown` (CommonMark, único
 * dialecto del proyecto); la búsqueda/reemplazo, `@sereneinserenade/tiptap-search-and-replace`.
 *
 * La paginación NO es una extensión: el editor es una hoja continua y las
 * divisiones de página se dibujan como guías visuales decorativas (ver
 * `RichEditor`), sin meterse en el documento. El corte real de páginas lo hace
 * el export a PDF.
 */
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import SearchAndReplace from "@sereneinserenade/tiptap-search-and-replace";
import { PageBreaks } from "./pageBreaksExtension";

/** Clase CSS de los matches de búsqueda (el match activo agrega `-current`). */
export const SEARCH_RESULT_CLASS = "q-books-search";

/**
 * Geometría de la hoja tipo libro de novela (trade paperback 6×9" a 96dpi). La
 * usa `RichEditor` para las guías de página y el contador, y se inyecta como CSS
 * vars en la hoja. Una sola fuente de verdad.
 */
export const BOOK_PAGE = {
  /** Ancho de la hoja (px). */
  width: 576,
  /** Margen lateral (px). */
  marginX: 64,
  /** Margen superior/inferior (px). */
  marginY: 64,
  /** Alto de TEXTO por página (px). Calibrado para ~270 palabras por página con la
   *  tipografía por defecto (≈ libro real 6×9"): el área de texto anterior
   *  (432×704) daba ~239 palabras; ésta (448×780) da ~275. Es la base de los
   *  cortes y del contador de páginas. */
  contentHeight: 780,
} as const;

/**
 * Atajos del editor: Alt+Q → negrita, Alt+E → cursiva. Binding cross-platform
 * vía TipTap; en Linux (plataforma primaria) `RichEditor` además intercepta por
 * `e.code`, porque con Alt algunos layouts cambian `e.key`.
 */
const BookShortcuts = Extension.create({
  name: "bookShortcuts",
  addKeyboardShortcuts() {
    return {
      "Alt-q": () => this.editor.commands.toggleBold(),
      "Alt-e": () => this.editor.commands.toggleItalic(),
    };
  },
});

/** Construye la lista de extensiones para `useEditor`. */
export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Markdown,
    SearchAndReplace.configure({
      searchResultClass: SEARCH_RESULT_CLASS,
      // Construimos el término como regex ya escapado en RichEditor, así
      // "palabra completa" puede envolverlo en \b…\b sin romper la búsqueda
      // literal normal.
      disableRegex: false,
    }),
    PageBreaks,
    BookShortcuts,
  ];
}
