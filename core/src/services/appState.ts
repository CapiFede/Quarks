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
  /**
   * Última carpeta usada en el backup manual a Drive (ver `account/backup.ts`).
   * Vive acá y NO en `settings.json` a propósito: es una ruta absoluta de ESTA
   * máquina (p. ej. `/mnt/Other/Backup`), que no significa nada en otra —
   * `settings.json` sincroniza y se la llevaría a los demás dispositivos.
   */
  backupPath: string;
}

const FILE = "appState";

const DEFAULTS: AppState = {
  openTabs: [],
  activeTab: "home",
  activeSpace: DEFAULT_SPACE.id,
  backupPath: "",
};

export async function loadAppState(): Promise<AppState> {
  const state = await readJson<AppState>(FILE, DEFAULTS);
  return {
    openTabs: Array.isArray(state.openTabs) ? state.openTabs : [],
    activeTab: typeof state.activeTab === "string" ? state.activeTab : "home",
    activeSpace:
      typeof state.activeSpace === "string" ? state.activeSpace : DEFAULT_SPACE.id,
    backupPath: typeof state.backupPath === "string" ? state.backupPath : "",
  };
}

/**
 * Guarda un PARCHE sobre el estado en disco (no lo reemplaza).
 *
 * Cada consumidor escribe solo sus campos: el Shell guarda tabs y space activo,
 * el panel de backup su ruta. Si esto pisara el archivo entero, el que guardara
 * último borraría los campos del otro — el Shell persiste en cada cambio de tab
 * y se llevaría puesto el `backupPath` sistemáticamente.
 */
export async function saveAppState(patch: Partial<AppState>): Promise<void> {
  const current = await loadAppState();
  await writeJson<AppState>(FILE, { ...current, ...patch });
}

/** Crea `appState.json` con los defaults si todavía no existe (arranque). */
export async function ensureAppStateFile(): Promise<void> {
  if (!(await existsJson(FILE))) await saveAppState(DEFAULTS);
}
