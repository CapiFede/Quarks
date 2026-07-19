import { useCallback, useState } from "react";
import type { AppSettings } from "../../services/settings";
import { loadSettings, saveSettings } from "../../services/settings";
import { report, withScope } from "../../services/log";

export interface SettingsController {
  settings: AppSettings;
  /** Aplica un patch parcial y lo persiste de forma atómica. */
  update: (patch: Partial<AppSettings>) => void;
  /** Re-lee el archivo de disco y reemplaza el estado (tras un pull de sync). */
  reload: () => void;
}

/**
 * Estado de la configuración del usuario. El valor inicial llega ya cargado
 * desde disco por el bootstrap (ver `App.tsx`); cada cambio se persiste.
 */
export function useSettings(initial: AppSettings): SettingsController {
  const [settings, setSettings] = useState<AppSettings>(initial);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void withScope("settings.save", () => saveSettings(next)).catch(report);
      return next;
    });
  }, []);

  const reload = useCallback(() => {
    void withScope("settings.reload", () => loadSettings())
      .then(setSettings)
      .catch(report);
  }, []);

  return { settings, update, reload };
}
