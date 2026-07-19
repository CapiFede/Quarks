/**
 * Persistencia GLOBAL de las preferencias del quark Utils. Un único archivo
 * `packages/utils/preferences.json` (no particionado por space). Reusa
 * `readJson`/`writeJson` del core, que escribe atómico y crea las carpetas
 * padre on-demand. Ver `.claude/knowledge/StorageLayout.md`.
 */
import { readJson, writeJson } from "@quarks/core";
import type { UtilsPreferences } from "../types";

const PREFS_KEY = "packages/utils/preferences";

export const DEFAULT_PREFS: UtilsPreferences = {
  activeTool: "clocks",
  timer: {
    presets: [
      { id: "p-1m", label: "1 min", ms: 60_000 },
      { id: "p-5m", label: "5 min", ms: 5 * 60_000 },
      { id: "p-25m", label: "25 min", ms: 25 * 60_000 },
      { id: "p-1h", label: "1 hora", ms: 60 * 60_000 },
    ],
    lastDurationMs: null,
  },
  alarms: { items: [] },
  random: { min: 1, max: 100 },
};

export async function readPrefs(): Promise<UtilsPreferences> {
  return readJson<UtilsPreferences>(PREFS_KEY, DEFAULT_PREFS);
}

export async function writePrefs(prefs: UtilsPreferences): Promise<void> {
  await writeJson<UtilsPreferences>(PREFS_KEY, prefs);
}
