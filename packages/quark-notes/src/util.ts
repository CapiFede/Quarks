/** Utilidades puras del notes quark. */

import type { NoteIndex } from "./types";

/**
 * ¿El contenido es el HTML del editor rich-text? Las notas de texto se guardan
 * como HTML desde que el editor es TipTap; las viejas siguen siendo texto plano
 * hasta la primera edición. Heurística: arranca con un tag de bloque conocido.
 */
export function looksLikeHtml(content: string): boolean {
  return /^\s*<(p|h[1-6]|ul|ol|li|table|blockquote|pre|hr|div)[\s>/]/i.test(content);
}

/**
 * HTML del editor → texto plano (previews, título sugerido). Aproximado a
 * propósito: cierra bloques con salto de línea, celdas con espacio, pela el
 * resto de los tags y decodifica las entidades básicas.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\/(?:th|td)>/gi, " ")
    .replace(/<(?:\/(?:p|h[1-6]|li|tr|div|blockquote|pre)|br\s*\/?)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Primer renglón no vacío del contenido, recortado para el preview. */
const PREVIEW_MAX = 80;

export function buildPreview(content: string): string {
  const source = looksLikeHtml(content) ? htmlToPlainText(content) : content;
  const trimmed = source.trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const flat = firstLine.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_MAX ? `${flat.slice(0, PREVIEW_MAX - 1)}…` : flat;
}

/**
 * Sugerencia de título a partir del contenido: las primeras palabras del
 * primer renglón, sin signos finales.
 */
const TITLE_MAX = 48;

export function suggestTitle(content: string): string {
  const preview = buildPreview(content);
  if (!preview) return "";
  const clean = preview.replace(/[.,;:!?]+$/u, "").trim();
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}

/** Formatea epoch ms para mostrar en la lista (Hoy, Ayer, día de la semana o dd mmm). */
export function formatRelativeDate(epochMs: number, now: Date = new Date()): string {
  const d = new Date(epochMs);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.floor((start(now) - start(d)) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) {
    const weekdays = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return weekdays[d.getDay()];
  }
  const months = [
    "Ene", "Feb", "Mar", "Abr", "May", "Jun",
    "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Hora del día en formato HH:MM (24h, locale es-AR). */
export function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Match case-insensitive sobre título y preview. */
export function filterNotes(notes: NoteIndex[], query: string): NoteIndex[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  return notes.filter(
    (n) => n.title.toLowerCase().includes(q) || n.preview.toLowerCase().includes(q),
  );
}

/** Ordena notas: las más recientes primero. */
export function sortByRecency(notes: NoteIndex[]): NoteIndex[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Paleta de colores que el usuario puede aplicar a una nota.
 *
 * Pasteles SÓLIDOS (sin alpha) — cualquier alpha sobre el surface oscuro deja
 * que el fondo sangre y "ensucia" el color. Los hex elegidos son los mismos
 * que se muestran en el selector (swatch == tint), así el resultado en la
 * sidebar es el color tal cual (no una versión filtrada). El CSS invierte el
 * texto a oscuro en notas tintadas para preservar contraste (pasteles claros
 * piden tipografía oscura, no la blanca del theme dark).
 *
 * Los IDs se persisten en disco; no se renombran al cambiar los hex.
 */
export const NOTE_COLORS: Array<{ id: string; label: string; swatch: string; tint: string }> = [
  { id: "neutral",  label: "Neutro",   swatch: "var(--q-border-light)", tint: "transparent" },
  { id: "rose",     label: "Rosa",     swatch: "#FFB0BE",               tint: "#FFB0BE" },
  { id: "coral",    label: "Coral",    swatch: "#FFB59A",               tint: "#FFB59A" },
  { id: "amber",    label: "Ámbar",    swatch: "#FFDA8A",               tint: "#FFDA8A" },
  { id: "lemon",    label: "Limón",    swatch: "#FFEC8C",               tint: "#FFEC8C" },
  { id: "sage",     label: "Sage",     swatch: "#A8E8B5",               tint: "#A8E8B5" },
  { id: "mint",     label: "Menta",    swatch: "#95E0C8",               tint: "#95E0C8" },
  { id: "primary",  label: "Turquesa", swatch: "#7FE5D8",               tint: "#7FE5D8" },
  { id: "indigo",   label: "Índigo",   swatch: "#B0BFFC",               tint: "#B0BFFC" },
  { id: "lavender", label: "Lavanda",  swatch: "#D4B5F0",               tint: "#D4B5F0" },
];

/**
 * Devuelve un id de color al azar para asignar a una nota nueva. Excluye
 * `neutral`: si queremos diferenciar las notas por color, abrir con "sin color"
 * derrota el propósito (el usuario siempre puede pasarlas a neutro a mano).
 */
export function randomNoteColorId(): string {
  const colorful = NOTE_COLORS.filter((c) => c.id !== "neutral");
  return colorful[Math.floor(Math.random() * colorful.length)].id;
}

export function colorTint(colorId: string | null): string {
  if (!colorId || colorId === "neutral") return "transparent";
  return NOTE_COLORS.find((c) => c.id === colorId)?.tint ?? "transparent";
}

export function colorSwatch(colorId: string | null): string {
  if (!colorId) return "var(--q-border-light)";
  return NOTE_COLORS.find((c) => c.id === colorId)?.swatch ?? "var(--q-border-light)";
}

/**
 * Acento saturado de la nota (para bordes / indicadores). Para `neutral` cae a
 * primary, así una nota sin color igual marca claramente el estado activo.
 */
export function colorAccent(colorId: string | null): string {
  if (!colorId || colorId === "neutral") return "var(--q-primary)";
  return NOTE_COLORS.find((c) => c.id === colorId)?.swatch ?? "var(--q-primary)";
}

// ── JSON: formato + tokenizer para highlight ────────────────────────────────

/**
 * Pretty-print JSON con indent de 2 espacios. Devuelve `null` si el contenido
 * no es JSON válido — el caller decide qué hacer (no perder el texto).
 */
export function formatJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export type JsonTokenKind =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punct"
  | "ws"
  | "plain";

export interface JsonToken {
  kind: JsonTokenKind;
  text: string;
}

/**
 * Tokeniza texto como JSON para syntax highlight. No falla nunca: lo que no
 * matchea cae como `plain`, así un buffer parcial mientras el usuario tipea
 * se sigue mostrando entero (con los pedazos ya válidos coloreados).
 *
 * "key" vs "string": una string es key si el próximo no-whitespace después de
 * cerrarla es `:`.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const len = text.length;
  let i = 0;
  while (i < len) {
    const ch = text[i];
    // Whitespace (preservar para que el render respete saltos / indent)
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      let j = i + 1;
      while (j < len) {
        const c = text[j];
        if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") break;
        j++;
      }
      tokens.push({ kind: "ws", text: text.slice(i, j) });
      i = j;
      continue;
    }
    // String (clave o valor)
    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        const c = text[j];
        if (c === "\\" && j + 1 < len) {
          j += 2;
          continue;
        }
        if (c === '"') {
          j++;
          break;
        }
        j++;
      }
      // Mirar el próximo no-whitespace: si es `:`, es una key.
      let k = j;
      while (k < len) {
        const c = text[k];
        if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") break;
        k++;
      }
      const isKey = text[k] === ":";
      tokens.push({ kind: isKey ? "key" : "string", text: text.slice(i, j) });
      i = j;
      continue;
    }
    // Number
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (m && m[0].length > 0) {
        tokens.push({ kind: "number", text: m[0] });
        i += m[0].length;
        continue;
      }
    }
    // Literales
    if (text.startsWith("true", i)) {
      tokens.push({ kind: "boolean", text: "true" });
      i += 4;
      continue;
    }
    if (text.startsWith("false", i)) {
      tokens.push({ kind: "boolean", text: "false" });
      i += 5;
      continue;
    }
    if (text.startsWith("null", i)) {
      tokens.push({ kind: "null", text: "null" });
      i += 4;
      continue;
    }
    // Puntuación
    if (ch === "{" || ch === "}" || ch === "[" || ch === "]" || ch === "," || ch === ":") {
      tokens.push({ kind: "punct", text: ch });
      i++;
      continue;
    }
    // Cualquier otra cosa (texto plano / mientras el usuario tipea algo aún no válido)
    tokens.push({ kind: "plain", text: ch });
    i++;
  }
  return tokens;
}
