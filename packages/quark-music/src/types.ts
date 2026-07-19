/** Modelos de datos del music quark. */

export interface Track {
  /** Ruta absoluta en disco. Es el id estable del track. */
  path: string;
  /** Título (de tags si hay, si no del nombre de archivo). */
  title: string;
  /** Artista (de tags; cadena vacía si no se conoce). */
  artist: string;
  /** Duración en segundos (0 si no se pudo leer). */
  durationSec: number;
}

export interface Playlist {
  /** Estable, generado al crear. */
  id: string;
  name: string;
  /** Rutas de tracks (referencias por `Track.path`), en orden. */
  trackPaths: string[];
}

/** Vista activa de la biblioteca: pseudo-listas o el id de una playlist. */
export type PlaylistView = "all" | "unassigned" | (string & {});
