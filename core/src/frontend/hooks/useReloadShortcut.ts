import { useEffect } from "react";

/**
 * F5 / Ctrl·Cmd+R → recarga completa del WebView, SOLO en dev.
 *
 * En Windows el WebView (WebView2/Chromium) trae estos atajos de fábrica; en
 * Linux (WebKitGTK) no existen, así que los cableamos a mano. En producción no
 * se monta: un F5 accidental recargaría toda la app y perdería el estado en
 * memoria — y Vite ya da HMR durante el desarrollo, esto es solo el reload duro.
 */
export function useReloadShortcut(): void {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const isReload = e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r");
      if (!isReload) return;
      e.preventDefault();
      window.location.reload();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
