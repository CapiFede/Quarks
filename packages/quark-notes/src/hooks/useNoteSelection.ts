/**
 * Variante para Notas del hook de selección que vive en quark-books. Misma
 * idea: un listener global a `selectionchange` filtrado al textarea activo,
 * acotado al árbol del editor de notas (`.q-notes-editor`).
 *
 * Devolvemos también el texto crudo: lo necesita el wiring con Quarky (que
 * lo publica al bus de selección para mostrar el badge y mandárselo a la IA).
 */
import { useEffect, useState } from "react";

export interface NoteSelection {
  /** Caracteres seleccionados (incluyendo espacios — el conteo simple). */
  chars: number;
  /** Palabras: tokens separados por whitespace, ignorando vacíos. */
  words: number;
  /** Texto crudo. Lo consume Quarky vía el bus. */
  text: string;
}

function countWords(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function useNoteSelection(): NoteSelection | null {
  const [sel, setSel] = useState<NoteSelection | null>(null);

  useEffect(() => {
    const handler = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el.tagName !== "TEXTAREA") {
        setSel(null);
        return;
      }
      if (!el.closest(".q-notes-editor")) {
        setSel(null);
        return;
      }
      const ta = el as HTMLTextAreaElement;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? 0;
      if (start === end) {
        setSel(null);
        return;
      }
      const text = ta.value.slice(start, end);
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
