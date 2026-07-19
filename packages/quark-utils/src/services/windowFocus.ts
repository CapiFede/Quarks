/**
 * Trae la ventana de la app al frente desde el frontend. Pensado para alarmas
 * y para el aviso de fin de timer. En Android es no-op (el sistema decide).
 *
 * Requiere los permisos `core:window:allow-show`, `allow-unminimize` y
 * `allow-set-focus` declarados en `src-tauri/capabilities/default.json`.
 */
import { isAndroid } from "@quarks/core";

export async function bringToFront(): Promise<void> {
  if (isAndroid) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.show();
    await w.unminimize();
    await w.setFocus();
  } catch {
    // Sin Tauri (browser dev) no hay ventana nativa: tragamos el error.
  }
}
