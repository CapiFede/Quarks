/**
 * Updates de la app. Envuelve `@tauri-apps/plugin-updater` con lazy import,
 * igual que `autostart.ts` — fuera de Tauri es no-op silencioso (browser dev,
 * Android sin canal nativo).
 *
 * El canal de updates en Android es la Play Store; en escritorio leemos un
 * `latest.json` hosteado en GitHub Releases (ver `tauri.conf.json > plugins.updater`).
 *
 * La verificación criptográfica del binario la hace el propio plugin contra la
 * `pubkey` del config — acá solo orquestamos el flujo UI: check → download →
 * relaunch.
 */
import { isTauri } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
import { report } from "./log";

export interface UpdateInfo {
  /** Versión que ofrece el endpoint (sin la `v` inicial). */
  version: string;
  /** Versión actual instalada (la de `tauri.conf.json`). */
  currentVersion: string;
  /** Changelog del release, si viene en el manifiesto. */
  notes?: string;
  /** Fecha de publicación ISO, si viene en el manifiesto. */
  date?: string;
}

export interface DownloadProgress {
  /** Bytes descargados acumulados. */
  downloaded: number;
  /** Total a descargar — `null` si el server no manda Content-Length. */
  total: number | null;
}

/**
 * Consulta el endpoint y devuelve `null` si ya estamos al día (o si no aplica:
 * browser, Android, falta de pubkey, etc.). No lanza — los errores se reportan
 * con `report()` y se traducen a `null` para que el caller pueda asumir
 * "no hay update" sin try/catch.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri() || isAndroid) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return null;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: update.body,
      date: update.date,
    };
  } catch (e) {
    report("updater.check", e);
    return null;
  }
}

/**
 * Descarga, instala y reinicia la app. El plugin valida la firma antes de
 * tocar el filesystem — si no matchea contra la pubkey embebida, tira y no
 * instala nada (ese error se propaga al caller para mostrarlo en UI).
 *
 * `onProgress` se invoca con bytes descargados acumulados (no incrementales)
 * para que el caller pueda calcular % contra `total`.
 */
export async function downloadAndInstall(
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!isTauri() || isAndroid) return;
  const { check } = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update?.available) return;

  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      onProgress?.({ downloaded: 0, total });
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.({ downloaded, total });
    }
  });

  // En Windows el NSIS reinicia la app por su cuenta tras instalar; en macOS/
  // Linux hay que relanzar a mano. `relaunch` del API core funciona en ambos.
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
