/**
 * Cortes de página como DECORACIONES de ProseMirror (no como contenido del
 * documento). Cada corte es un widget de bloque no-editable que materializa el
 * espacio entre páginas (márgenes arriba/abajo) con una línea separadora y la
 * etiqueta "página N".
 *
 * Por qué decoraciones y no nodos ni DOM a mano:
 *   - No entran al documento → no contaminan el markdown ni el undo/redo.
 *   - Son el mecanismo nativo de ProseMirror para "adornos" entre bloques, así
 *     que la selección, el caret y el click los tratan bien (a diferencia del
 *     overlay flotante de pagination-plus, que rompía el mapeo de coordenadas).
 *
 * Las POSICIONES de corte las calcula `RichEditor` midiendo el alto real del
 * contenido y se empujan con el comando `setPageBreaks`. Esta extensión solo las
 * dibuja.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const pageBreaksKey = new PluginKey<DecorationSet>("pageBreaks");

/**
 * Un corte de página. `gapHeight` es la altura TOTAL del separador (relleno de la
 * página anterior + márgenes), y `lineOffset` es la posición de la línea dentro
 * del separador. Calculados por `RichEditor` para que la línea quede clavada en
 * la grilla de páginas (no se mueve al agregar/quitar texto).
 */
export interface PageBreak {
  pos: number;
  gapHeight: number;
  lineOffset: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreaks: {
      /** Setea los cortes (posición + geometría) donde empieza cada página nueva. */
      setPageBreaks: (breaks: PageBreak[]) => ReturnType;
    };
  }
}

/** Construye los widgets de corte. `i`-ésimo corte = inicio de la página `i + 2`. */
function buildDecorations(breaks: PageBreak[]): Decoration[] {
  return breaks.map((b, i) =>
    Decoration.widget(
      b.pos,
      () => {
        // <span display:block> (no <div>): un bloque dentro de un <p> es HTML
        // inválido y el navegador cerraría el párrafo; un span con display block
        // es válido y parte la línea, así el corte puede caer DENTRO de un párrafo.
        const el = document.createElement("span");
        el.className = "q-books-pagebreak";
        el.setAttribute("contenteditable", "false");
        el.style.display = "block";
        el.style.height = `${b.gapHeight}px`;
        const line = document.createElement("span");
        line.className = "q-books-pagebreak-line";
        line.style.top = `${b.lineOffset}px`;
        const label = document.createElement("span");
        label.className = "q-books-pagebreak-label";
        label.style.top = `${b.lineOffset}px`;
        label.textContent = `página ${i + 2}`;
        el.append(line, label);
        return el;
      },
      // `side: -1` → el widget va ANTES de la posición (cierra la página previa y
      // abre la siguiente). `key` estable (incluye la geometría) → ProseMirror
      // reusa el DOM si no cambió y lo recrea si cambió.
      { side: -1, key: `pb-${i}-${b.pos}-${b.gapHeight}-${b.lineOffset}` },
    ),
  );
}

export const PageBreaks = Extension.create({
  name: "pageBreaks",

  addCommands() {
    return {
      setPageBreaks:
        (breaks: PageBreak[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(pageBreaksKey, breaks));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pageBreaksKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const breaks = tr.getMeta(pageBreaksKey) as PageBreak[] | undefined;
            if (breaks) {
              return DecorationSet.create(tr.doc, buildDecorations(breaks));
            }
            // Sin cambios de cortes: mapear las decoraciones a través de la edición.
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return pageBreaksKey.getState(state);
          },
        },
      }),
    ];
  },
});
