/**
 * Hook que devuelve el conteo de palabras/caracteres seleccionados dentro del
 * editor de capítulos (o `null` si no hay selección). Trabaja sobre la instancia
 * de TipTap: lee el rango de selección de ProseMirror, sin tocar el DOM.
 *
 * También devuelve el texto crudo: lo necesita el wiring con Quarky (al publicar
 * la selección en el bus, ver `BookEditor`).
 */
import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { countChars, countWords } from "../util/metrics";

export interface SelectionStats {
  words: number;
  chars: number;
  text: string;
}

export function useEditorSelection(editor: Editor | null): SelectionStats | null {
  const [sel, setSel] = useState<SelectionStats | null>(null);

  useEffect(() => {
    if (!editor) {
      setSel(null);
      return;
    }
    const update = (): void => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setSel(null);
        return;
      }
      // textBetween con separadores de bloque ' ' para no pegar palabras de
      // párrafos distintos al contar.
      const text = editor.state.doc.textBetween(from, to, " ", " ");
      if (!text.trim()) {
        setSel(null);
        return;
      }
      setSel({ words: countWords(text), chars: countChars(text), text });
    };
    // Al perder el foco vaciamos la selección (igual que notes con `focusout`):
    // el Shell deja la pane montada con `display:none` al cambiar de tab, así
    // que sin esto la selección publicada a Quarky quedaría colgada. Al volver
    // el foco ProseMirror conserva la selección en su state: la republicamos.
    const clear = (): void => setSel(null);
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("blur", clear);
    editor.on("focus", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("blur", clear);
      editor.off("focus", update);
    };
  }, [editor]);

  return sel;
}
