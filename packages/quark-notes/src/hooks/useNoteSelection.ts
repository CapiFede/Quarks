/**
 * Variante para Notas del hook de selección que vive en quark-books. Misma
 * idea: un listener global a `selectionchange` filtrado al textarea activo,
 * acotado al árbol del editor de notas (`.q-notes-editor`).
 *
 * Devolvemos también el texto crudo: lo necesita el wiring con Quarky (que
 * lo publica al bus de selección para mostrar el badge y mandárselo a la IA).
 */
import { useEffect, useState } from "react";
import { countWords } from "@quarks/core";

export interface NoteSelection {
  /** Caracteres seleccionados (incluyendo espacios — el conteo simple). */
  chars: number;
  /** Palabras: tokens separados por whitespace, ignorando vacíos. */
  words: number;
  /** Texto crudo. Lo consume Quarky vía el bus. */
  text: string;
}

export function useNoteSelection(): NoteSelection | null {
  const [sel, setSel] = useState<NoteSelection | null>(null);

  useEffect(() => {
    const handler = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !el.closest(".q-notes-editor")) {
        setSel(null);
        return;
      }
      // Editor JSON: textarea clásico, selección por índices.
      if (el.tagName === "TEXTAREA") {
        const ta = el as HTMLTextAreaElement;
        const start = ta.selectionStart ?? 0;
        const end = ta.selectionEnd ?? 0;
        if (start === end) {
          setSel(null);
          return;
        }
        const text = ta.value.slice(start, end);
        setSel({ chars: text.length, words: countWords(text), text });
        return;
      }
      // Editor rich-text (contenteditable de TipTap): selección del documento.
      const s = window.getSelection();
      const text = s && !s.isCollapsed ? s.toString() : "";
      if (!text) {
        setSel(null);
        return;
      }
      setSel({ chars: text.length, words: countWords(text), text });
    };
    document.addEventListener("selectionchange", handler);
    document.addEventListener("focusout", handler);
    return () => {
      document.removeEventListener("selectionchange", handler);
      document.removeEventListener("focusout", handler);
    };
  }, []);

  return sel;
}
