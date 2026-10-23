/** Métricas simples del editor: palabras, caracteres. */

// `countWords` es el del core (misma definición que usan Notas y Quarky); se
// re-exporta para que el resto del quark siga importando las métricas de acá.
export { countWords } from "@quarks/core";

/** "1 palabra" / "N palabras", para los folios de página. */
export function formatWords(n: number): string {
  return n === 1 ? "1 palabra" : `${n} palabras`;
}

/** Cuenta caracteres tal cual (incluye espacios y newlines). */
export function countChars(text: string): number {
  return text.length;
}
