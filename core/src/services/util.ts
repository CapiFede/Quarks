/**
 * Helpers chicos que necesitan el core y los quarks por igual. Puros, sin IO.
 * Se exponen vía `@quarks/core` para que cada quark no tenga su copia.
 */

/** Id estable para entidades nuevas (notas, libros, conversaciones, alarmas…). */
export function newId(): string {
  return crypto.randomUUID();
}

/** Mensaje legible de cualquier cosa que haya sido lanzada (`Error`, string, objeto). */
export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Cuenta palabras: rachas de caracteres no espaciados. Ignora espacios
 * múltiples y saltos de línea. Suficiente para contadores de UI.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/u).length;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Título por defecto de lo que todavía no tiene nombre (notas, conversaciones). */
export const UNTITLED = "Sin título";
