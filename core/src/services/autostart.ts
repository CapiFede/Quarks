/**
 * Arranque con el SO. Envuelve `@tauri-apps/plugin-autostart`, que registra la
 * app en el mecanismo nativo (en Windows, la clave Run del registro).
 *
 * El estado real lo administra el SO, así que esta es la fuente de verdad del
 * toggle de Settings — no se duplica en `settings.json`. Fuera de Tauri es
 * no-op y `isAutostartEnabled()` devuelve `false`.
 */
import { isTauri } from "@tauri-apps/api/core";
import { report } from "./log";

export async function isAutostartEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch (e) {
    report("autostart.isEnabled", e);
    return false;
  }
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isTauri()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (enabled) await enable();
  else await disable();
}
