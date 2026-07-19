/**
 * Persistencia de la sección "console" del space activo.
 *
 * Guardamos solo el ÍNDICE de sesiones (id + shell + cwd + elevated). El runtime
 * (instancia xterm, scrollback) vive en el store y se descarta al cerrar la
 * app — al reabrir, las sesiones se re-spawnean fresh con su cwd recordado.
 *
 * Reutiliza `readSpaceSection` / `writeSpaceSection` del core, que preservan
 * las secciones de los demás quarks dentro de `spaces/<spaceId>.json`.
 */
import { readSpaceSection, writeSpaceSection } from "@quarks/core";
import type { ConsoleSession, ConsoleSpaceSection } from "../types";

const QUARK_ID = "console";

const DEFAULT_SECTION: ConsoleSpaceSection = {
  sessions: [],
  activeSessionId: null,
};

export async function readConsoleSpace(spaceId: string): Promise<ConsoleSpaceSection> {
  return readSpaceSection<ConsoleSpaceSection>(spaceId, QUARK_ID, DEFAULT_SECTION);
}

export async function writeConsoleSpace(
  spaceId: string,
  sessions: ConsoleSession[],
  activeSessionId: string | null,
): Promise<void> {
  await writeSpaceSection<ConsoleSpaceSection>(spaceId, QUARK_ID, {
    sessions,
    activeSessionId,
  });
}
