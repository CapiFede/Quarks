import type { PlayOrder, TrackSort } from "./types";

/** Formatea segundos como mm:ss. */
export function fmtTime(sec: number): string {
  const s = isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Formatea segundos como m:ss.mmm (precisión de milisegundos para el zoom). */
export function fmtFine(sec: number): string {
  const v = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  const ms = Math.round((v - Math.floor(v)) * 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/**
 * Etiqueta de tiempo adaptada a la escala: con marcas de menos de 1s muestra
 * milisegundos; si no, m:ss.
 */
export function fmtScaled(sec: number, stepSec: number): string {
  return stepSec < 1 ? fmtFine(sec) : fmtTime(sec);
}

/** Puntaje máximo de una canción (el mínimo es 1). */
export const RATING_MAX = 10;

/**
 * Color de un puntaje: de rojo (1) a verde (`RATING_MAX`), pasando por
 * amarillo. Tonos suaves para el tema oscuro. `alpha` < 1 para fondos.
 */
export function ratingColor(score: number, alpha = 1): string {
  const t = (Math.min(Math.max(score, 1), RATING_MAX) - 1) / (RATING_MAX - 1);
  return `hsla(${Math.round(t * 125)}, 62%, 64%, ${alpha})`;
}

/** Órdenes de reproducción, con su ícono y nombre (menús del player y de la toolbar). */
export const PLAY_ORDERS: { id: PlayOrder; icon: string; label: string }[] = [
  { id: "normal", icon: "format_list_numbered", label: "En orden" },
  { id: "shuffle", icon: "shuffle", label: "Aleatorio" },
  { id: "leastPlayed", icon: "explore", label: "Menos escuchadas primero" },
  { id: "mostPlayed", icon: "local_fire_department", label: "Más escuchadas primero" },
  { id: "topRated", icon: "star", label: "Mejor puntuadas primero" },
];

/** Órdenes de la lista, con su ícono y nombre (menú de orden de la toolbar). */
export const TRACK_SORTS: { id: TrackSort; icon: string; label: string }[] = [
  { id: "list", icon: "segment", label: "Orden de la lista" },
  { id: "name", icon: "sort_by_alpha", label: "Por nombre" },
  { id: "rating", icon: "star", label: "Mejor puntuadas primero" },
  { id: "newest", icon: "schedule", label: "Más nuevas primero" },
  { id: "oldest", icon: "history", label: "Más viejas primero" },
];

/** Posición horizontal de `clientX` dentro de `el`, como fracción 0..1 de su ancho. */
export function fractionAt(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
}
