/** Modelos de datos del quark Editor. */

/** De dónde salió el clip que se está editando. */
export type SourceOrigin = "music" | "import";

/** Una canción de la biblioteca de Música, ofrecida en el selector. */
export interface SongRef {
  /** Ruta absoluta (entrada para ffmpeg + preview). */
  path: string;
  /** Nombre visible (stem del archivo). */
  name: string;
  /** Extensión en minúscula, sin punto. */
  ext: string;
}

/** Clip cargado en el editor. */
export interface Source {
  origin: SourceOrigin;
  /** Ruta de trabajo: la entrada de ffmpeg y de la preview (dentro de AppData). */
  workPath: string;
  /**
   * Ruta a sobrescribir con "Sobrescribir original". Para Música es la misma
   * canción; para un import es el archivo externo elegido.
   */
  originalPath: string;
  /** Nombre visible. */
  name: string;
  /** Extensión en minúscula, sin punto. */
  ext: string;
  durationSec: number;
  hasVideo: boolean;
}

/**
 * Tramo a CONSERVAR sobre la línea de tiempo original, en segundos. La edición
 * es la lista ordenada de estos tramos: cortar parte un segmento en dos y borrar
 * lo del medio; exportar reconcatena los que quedan (rejunta las puntas).
 */
export interface Segment {
  start: number;
  end: number;
}
