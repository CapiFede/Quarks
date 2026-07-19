/**
 * Hotkey global para abrir/cerrar el panel de Quarky.
 *
 * Tecla: **F4** (decisión del usuario; libre en la mayoría de apps, no choca con
 * shortcuts del WebView). El hook se monta en el Shell y respeta lo de Settings:
 * si la modal de configuración está abierta, F4 no hace nada (Settings se cierra
 * con Escape; no queremos toggle de Quarky encima).
 */
import { useEffect } from "react";
import { useQuarky } from "./useQuarky";

export function useQuarkyHotkeys(opts: { settingsOpen: boolean }) {
  const { toggle } = useQuarky();
  const { settingsOpen } = opts;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "F4" || settingsOpen) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, toggle]);
}
