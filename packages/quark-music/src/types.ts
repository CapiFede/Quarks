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
  /** Creación del archivo, en ms desde epoch (0 si no se pudo leer). */
  createdMs: number;
}

export interface Playlist {
  /** Estable, generado al crear. */
  id: string;
  name: string;
  /** Categoría en la que vive, o `null` si está suelta. */
  categoryId: string | null;
  /** Rutas de tracks (referencias por `Track.path`), en orden. */
  trackPaths: string[];
}

/** Agrupa playlists. Una playlist vive en a lo sumo una categoría. */
export interface Category {
  /** Estable, generado al crear. */
  id: string;
  name: string;
}

/**
 * Vista activa de la biblioteca: pseudo-listas o el id de una playlist. Con una
 * categoría seleccionada, "all" es la unión de las playlists de esa categoría.
 */
export type PlaylistView = "all" | "unassigned" | (string & {});

/**
 * Cómo elige el reproductor el "siguiente" de la vista:
 *   - `normal`: en orden.
 *   - `shuffle`: al azar.
 *   - `leastPlayed` / `mostPlayed`: primero las de menos / más reproducciones
 *     (empates al azar).
 *   - `topRated`: primero las de más puntaje y de ahí para abajo; las sin
 *     puntaje al final (empates al azar).
 * Los cuatro últimos no repiten un track hasta pasar por toda la vista.
 */
export type PlayOrder = "normal" | "shuffle" | "leastPlayed" | "mostPlayed" | "topRated";

/**
 * Cómo se ordena la lista (y con ella la cola en orden normal):
 *   - `list`: el orden propio de la vista (el de la playlist; artista/título en
 *     la biblioteca).
 *   - `name`: por nombre, A → Z.
 *   - `rating`: por puntaje, de mayor a menor; las sin puntaje al final.
 *   - `newest` / `oldest`: por fecha de creación del archivo.
 */
export type TrackSort = "list" | "name" | "rating" | "newest" | "oldest";
