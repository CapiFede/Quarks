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
