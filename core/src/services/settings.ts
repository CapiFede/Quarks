/**
 * Configuración del usuario, persistida en `<AppData>/com.quarks.app/settings.json`.
 *
 * A diferencia de `appState.json` (estado de runtime: tabs, tab activo),
 * acá viven los ajustes que el usuario edita explícitamente desde Settings.
 *
 * La configuración propia de Quarky (modelo, workspace root, modos, hops) NO vive
 * acá: tiene su propio archivo en `quarky/config.json` (ver `quarky/store.ts`)
 * porque sincroniza con Drive como parte del subsistema Quarky. La API key
 * tampoco va en JSON: vive en el keyring del SO. En `settings.json` solo dejamos
 * la pista de qué modelo está elegido para que `Settings.tsx` lo pueda ofrecer al
 * usuario sin tener que cargar `quarky/config.json` antes de abrir el panel.
 *
 * Campos que se agregan en fases siguientes (reservados, no se modelan aún):
 *   - `drive`                   (Fase 0.6; los tokens van al keyring, no acá)
 *
 * El space activo NO vive acá: es estado de runtime (device-local) y va en
 * `appState.json`. Acá solo viven las definiciones de Spaces (que sí sincronizan).
 */
import { existsJson, readJson, writeJson } from "./store";
import { type Space, DEFAULT_SPACE, normalizeSpaces } from "./spaces";

export interface AppSettings {
  /** Versión del esquema, para migraciones futuras. */
  version: number;
  /** Nombre que se muestra en el strip de usuario del Home. Se setea desde la
   *  cuenta logueada (ver Shell); vacío hasta que el usuario inicie sesión. */
  displayName: string;
  /** Spaces definidos por el usuario (siempre ≥1; ver `spaces.ts`). */
  spaces: Space[];
}

const FILE = "settings";

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  displayName: "",
  spaces: [DEFAULT_SPACE],
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await readJson<AppSettings>(FILE, DEFAULT_SETTINGS);
  const normalized = { ...raw, spaces: normalizeSpaces(raw.spaces) };
  // Si el archivo no existía, readJson devuelve DEFAULT_SETTINGS sin escribir nada.
  // Lo escribimos acá para que exista desde el primer launch (sync, inspección, etc.).
  try {
    if (!(await existsJson(FILE))) await saveSettings(normalized);
  } catch {
    // No crítico: si falla la escritura inicial el app sigue funcionando.
  }
  return normalized;
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJson(FILE, settings);
}
