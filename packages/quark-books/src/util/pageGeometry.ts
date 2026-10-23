/**
 * Geometría FÍSICA de la hoja del editor. La hoja imita un libro impreso de
 * verdad: formato (trim size) y márgenes en pulgadas, convertidos a px a la
 * escala CSS estándar (96 px por pulgada, o sea 16px = 12pt). Así, con la
 * tipografía elegida, cada página del editor tiene las mismas líneas y palabras
 * que tendría la página impresa en ese formato.
 *
 * Única fuente de verdad del tamaño de página: la usa `RichEditor` para los
 * cortes de página y el contador, y se inyecta como CSS vars en la hoja.
 */
import type { TrimSize } from "../types";

/** px por pulgada en CSS. */
const PX_PER_INCH = 96;

interface TrimSpec {
  /** Ancho y alto de la hoja (in). */
  w: number;
  h: number;
  /**
   * Márgenes lateral y vertical (in). Simétricos: mostramos páginas sueltas, no
   * pliegos, así que no distinguimos margen interior/exterior. Valores típicos
   * de novela: 0.75″ para 6×9 y 5.5×8.5, un poco menos de lado para 5×8.
   */
  mx: number;
  my: number;
  /** Etiqueta corta para el menú de tipografía. */
  label: string;
  /** Equivalente en cm (tooltip). */
  cm: string;
}

/** Formatos estándar de novela, en pulgadas (los que aceptan las imprentas). */
export const TRIMS: Record<TrimSize, TrimSpec> = {
  "5x8": { w: 5, h: 8, mx: 0.625, my: 0.75, label: "5×8″", cm: "12,7 × 20,3 cm" },
  "5.5x8.5": { w: 5.5, h: 8.5, mx: 0.75, my: 0.75, label: "5½×8½″", cm: "14 × 21,6 cm" },
  "6x9": { w: 6, h: 9, mx: 0.75, my: 0.75, label: "6×9″", cm: "15,2 × 22,9 cm" },
};

export const TRIM_SIZES = Object.keys(TRIMS) as TrimSize[];

export const DEFAULT_TRIM: TrimSize = "6x9";

export function isTrimSize(v: unknown): v is TrimSize {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(TRIMS, v);
}

/** Medidas de la hoja en px. */
export interface PageGeometry {
  /** Ancho y alto totales de la hoja. */
  width: number;
  height: number;
  /** Margen lateral y vertical. */
  marginX: number;
  marginY: number;
  /** Bloque de TEXTO por página. Es la base de los cortes y del contador. */
  contentWidth: number;
  contentHeight: number;
}

export function pageGeometry(trim: TrimSize): PageGeometry {
  const t = TRIMS[trim];
  const width = Math.round(t.w * PX_PER_INCH);
  const height = Math.round(t.h * PX_PER_INCH);
  const marginX = Math.round(t.mx * PX_PER_INCH);
  const marginY = Math.round(t.my * PX_PER_INCH);
  return {
    width,
    height,
    marginX,
    marginY,
    contentWidth: width - 2 * marginX,
    contentHeight: height - 2 * marginY,
  };
}
