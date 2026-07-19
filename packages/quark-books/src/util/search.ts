/**
 * Búsqueda y reemplazo dentro del texto del capítulo abierto.
 * Sin dependencias; soporta case-insensitive (default) y "palabra completa".
 */

export interface SearchOpts {
  query: string;
  caseSensitive: boolean;
  matchWord: boolean;
}

export interface Range {
  /** Índice del primer caracter del match (inclusive). */
  start: number;
  /** Índice del caracter después del match (exclusive). */
  end: number;
}

/** Escapa caracteres especiales de regex en `s` (literal match). */
function escape(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Devuelve todos los rangos de match en `text` para `query`. Vacío si la query
 * está vacía. No devuelve solapamientos: el cursor avanza al final de cada match.
 */
export function findMatches(text: string, opts: SearchOpts): Range[] {
  const { query, caseSensitive, matchWord } = opts;
  if (!query) return [];
  const flags = caseSensitive ? "gu" : "giu";
  const body = escape(query);
  const pattern = matchWord ? `\\b${body}\\b` : body;
  const re = new RegExp(pattern, flags);
  const out: Range[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // `\\b` con texto vacío empuja `lastIndex` por nosotros; pero por seguridad
    // ante regex con largo 0 (no debería pasar acá, query !== "") incrementamos.
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Aplica un reemplazo único: sustituye el rango `[match.start, match.end)` por
 * `replacement` y devuelve el texto resultante. El llamador es responsable de
 * recalcular los matches con `findMatches` tras esto.
 */
export function replaceAt(text: string, match: Range, replacement: string): string {
  return text.slice(0, match.start) + replacement + text.slice(match.end);
}

/**
 * Reemplaza todos los matches por `replacement`. Itera en orden inverso para no
 * invalidar los índices al insertar.
 */
export function replaceAll(text: string, matches: Range[], replacement: string): string {
  if (matches.length === 0) return text;
  let out = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    out = replaceAt(out, matches[i]!, replacement);
  }
  return out;
}
