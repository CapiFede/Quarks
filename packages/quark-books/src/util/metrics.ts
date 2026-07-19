/** Métricas simples del editor: palabras, caracteres. */

/**
 * Cuenta palabras de un texto. Una "palabra" es una racha de caracteres no
 * espaciados: el método ignora múltiples espacios y newlines. Suficiente para
 * el contador de la sidebar y del footer (no es la métrica de un editor de
 * código).
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

/** Cuenta caracteres tal cual (incluye espacios y newlines). */
export function countChars(text: string): number {
  return text.length;
}
