/**
 * Punto de entrada del quark Consola. Exporta la instancia que el registry
 * del core importa y registra (`@quarks/quark-console`).
 */
import { createConsoleQuark } from "./ConsoleQuark";

export const consoleQuark = createConsoleQuark();
