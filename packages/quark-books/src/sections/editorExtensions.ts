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
 * `RichEditor` y `util/pageGeometry`), sin meterse en el documento. El corte
 * real de páginas lo hace el export a PDF.
 */
import { Extension } from "@tiptap/core";
import { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import SearchAndReplace from "@sereneinserenade/tiptap-search-and-replace";
import { PageBreaks } from "./pageBreaksExtension";

/** Clase CSS de los matches de búsqueda (el match activo agrega `-current`). */
export const SEARCH_RESULT_CLASS = "q-books-search";

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

/**
 * Pegado como MARKDOWN. Tomamos siempre el texto plano del portapapeles y lo
 * parseamos con el mismo parser que lee los `.md` del disco, ignorando el HTML
 * que agregan otras apps. Dos motivos:
 *   - VS Code (y otros editores de texto) copian cada línea como un `<div>` y
 *     cada línea vacía como un `<br>`; ProseMirror convertía cada `<br>` suelto
 *     en un párrafo vacío, y pegar un capítulo dejaba un "doble enter" entre
 *     todos los párrafos.
 *   - El markdown es la fuente de verdad: pegar `***`, `**negrita**` o `# Título`
 *     tiene que dar lo mismo que abrir ese texto desde el archivo.
 * Excepciones, que van por el pegado nativo: copiar/pegar DENTRO del editor
 * (ProseMirror marca su HTML con `data-pm-slice` y conserva el formato exacto) y
 * pegar dentro de un bloque de código (texto literal).
 */
const MarkdownPaste = Extension.create({
  name: "markdownPaste",
  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin({
        key: new PluginKey("markdownPaste"),
        props: {
          handlePaste(view, event) {
            const data = event.clipboardData;
            if (!data) return false;
            const text = data.getData("text/plain");
            if (!text.trim()) return false;
            if (data.getData("text/html").includes("data-pm-slice")) return false;
            if (view.state.selection.$from.parent.type.spec.code) return false;
            const markdown = editor.markdown;
            if (!markdown) return false;

            const doc = view.state.schema.nodeFromJSON(markdown.parse(text));
            // Slice abierto por ambos lados, como el pegado nativo de HTML: el
            // primer párrafo se funde con el párrafo donde está el cursor y el
            // último con lo que sigue. Pegar en una hoja vacía no deja párrafos
            // vacíos de más.
            const slice = Slice.maxOpen(doc.content);
            const tr = view.state.tr.replaceSelection(slice).scrollIntoView();
            view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste"));
            return true;
          },
        },
      }),
    ];
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
    MarkdownPaste,
    BookShortcuts,
  ];
}
