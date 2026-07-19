/**
 * Punto de entrada del quark Música. Exporta la instancia que el registry del
 * core importa y registra (`@quarks/quark-music`).
 */
import { createMusicQuark } from "./MusicQuark";

export const musicQuark = createMusicQuark();
