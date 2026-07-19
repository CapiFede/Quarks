/**
 * Estado de runtime de la app (qué tabs están abiertos, cuál está activo).
 *
 * Se persiste en `<AppData>/com.quarks.app/appState.json` vía el store atómico (ver
 * `store.ts`). Es device-local: NO sincroniza con Drive. Fuera de Tauri cae a
 * localStorage de forma transparente.
 *
 * No confundir con `settings.ts`: acá vive el estado volátil de la sesión,
 * no la configuración que el usuario edita explícitamente.
 */
import { existsJson, readJson, writeJson } from "./store";
import { DEFAULT_SPACE } from "./spaces";

export interface AppState {
  /** ids de quarks abiertos, en orden de tab. */
  openTabs: string[];
  /** 'home' o el id de un quark abierto. */
  activeTab: string;
  /** id del Space activo (device-local). Se resuelve contra la lista en el Shell. */
  activeSpace: string;
}

const FILE = "appState";

const DEFAULTS: AppState = {
  openTabs: [],
  activeTab: "home",
  activeSpace: DEFAULT_SPACE.id,
};

export async function loadAppState(): Promise<AppState> {
  const state = await readJson<AppState>(FILE, DEFAULTS);
  return {
    openTabs: Array.isArray(state.openTabs) ? state.openTabs : [],
    activeTab: typeof state.activeTab === "string" ? state.activeTab : "home",
    activeSpace:
      typeof state.activeSpace === "string" ? state.activeSpace : DEFAULT_SPACE.id,
  };
}

export async function saveAppState(state: AppState): Promise<void> {
  await writeJson(FILE, state);
}

/** Crea `appState.json` con los defaults si todavía no existe (arranque). */
export async function ensureAppStateFile(): Promise<void> {
  if (!(await existsJson(FILE))) await saveAppState(DEFAULTS);
}
