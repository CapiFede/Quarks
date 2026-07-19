/** Formatea segundos como mm:ss. */
export function fmtTime(sec: number): string {
  const s = isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
