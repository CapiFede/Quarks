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

export interface AppState {
  /** ids de quarks abiertos, en orden de tab. */
  openTabs: string[];
  /** 'home' o el id de un quark abierto. */
  activeTab: string;
}

const FILE = "appState";

const DEFAULTS: AppState = {
  openTabs: [],
  activeTab: "home",
};

export async function loadAppState(): Promise<AppState> {
  const state = await readJson<AppState>(FILE, DEFAULTS);
  return {
    openTabs: Array.isArray(state.openTabs) ? state.openTabs : [],
    activeTab: typeof state.activeTab === "string" ? state.activeTab : "home",
  };
}

/**
 * Guarda un PARCHE sobre el estado en disco (no lo reemplaza): cada consumidor
 * escribe solo sus campos y no pisa los del resto.
 *
 * Las llamadas se encadenan: el ciclo leer → fusionar → escribir no es atómico
 * (`writeJson` serializa solo la escritura), y dos `saveAppState` solapados
 * leerían el mismo estado y el segundo pisaría al primero.
 */
let chain: Promise<void> = Promise.resolve();
export function saveAppState(patch: Partial<AppState>): Promise<void> {
  const next = chain.then(async () => {
    const current = await loadAppState();
    await writeJson<AppState>(FILE, { ...current, ...patch });
  });
  chain = next.catch(() => {});
  return next;
}

/** Crea `appState.json` con los defaults si todavía no existe (arranque). */
export async function ensureAppStateFile(): Promise<void> {
  if (!(await existsJson(FILE))) await saveAppState(DEFAULTS);
}
