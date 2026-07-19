/**
 * Punto de entrada del quark Utilidades. Exporta la instancia que el registry
 * del core importa y registra (`@quarks/quark-utils`).
 */
import { createUtilsQuark } from "./UtilsQuark";

export const utilsQuark = createUtilsQuark();
