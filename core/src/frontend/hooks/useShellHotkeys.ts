import { useEffect } from "react";
import type { Shell } from "./useShell";

/**
 * Hotkeys globales de navegación del shell.
 * - Ctrl/Cmd+T → abre el launcher (Home) para elegir un quark.
 * - Ctrl/Cmd+W → cierra el tab activo (no hace nada en Home).
 *
 * El Escape global (cierra Quarky → settings → quark.onEscape()) se cableará
 * cuando existan esos destinos.
 */
export function useShellHotkeys(shell: Shell): void {
  const { active, activate, closeTab } = shell;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();

      if (key === "t") {
        e.preventDefault();
        activate("home");
      } else if (key === "w") {
        if (active !== "home") {
          e.preventDefault();
          closeTab(active);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, activate, closeTab]);
}
