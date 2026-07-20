/**
 * Backup manual a Google Drive.
 *
 * Distinto del sync (`sync.ts`), a propósito y en todo:
 *
 *   |            | Sync                          | Backup                      |
 *   |------------|-------------------------------|-----------------------------|
 *   | Qué        | El árbol gestionado de la app | Una carpeta cualquiera      |
 *   | Cómo       | Incremental, archivo x archivo| Un zip entero               |
 *   | Cuándo     | Seguido                       | Manual, a mano              |
 *   | Dónde      | Carpeta "Quarks"              | Carpeta "Quarks Backups"    |
 *
 * Va a una carpeta APARTE porque un backup pesa mucho más que el árbol
 * sincronizado y no queremos que el motor de sync lo vea nunca: `listDataTree`
 * solo mira `settings.json` + `spaces/` + `packages/` + `quarky/`, así que un
 * zip en otra carpeta del Drive le es invisible.
 *
 * El trabajo pesado (comprimir + subir) vive en Rust (`src-tauri/src/backup.rs`):
 * el zip se arma por streaming y la subida usa resumable upload en chunks, así
 * un backup de decenas de GB no pasa por el heap del WebView. Acá quedan la
 * orquestación con la cuenta y el reemplazo del backup anterior.
 *
 * Semántica de reemplazo: subimos el zip NUEVO primero y solo cuando terminó
 * bien mandamos el viejo a la papelera. Si la subida falla o se cancela, el
 * backup anterior sigue intacto en Drive.
 */
import { invoke, Channel, isTauri } from "@tauri-apps/api/core";
import { getAccessToken } from "./account";
import { googleDriveProvider } from "./googleDrive";

/** Carpeta del Drive donde viven los backups. Separada de la del sync ("Quarks"). */
export const BACKUP_FOLDER = "Quarks Backups";

/** Progreso emitido por el comando `backup_run` (ver `BackupProgress` en Rust). */
export type BackupProgress =
  | { phase: "scanning" }
  | { phase: "zipping"; done: number; total: number; file: string }
  | { phase: "zipped"; bytes: number }
  | { phase: "uploading"; sent: number; total: number }
  | { phase: "done"; fileId: string };

export interface BackupEstimate {
  files: number;
  bytes: number;
}

/** Texto exacto con el que Rust corta una operación cancelada. */
export const CANCELLED = "Backup cancelado.";

/** Nombre del zip en Drive: el de la carpeta de origen. */
export function zipNameFor(source: string): string {
  const clean = source.replace(/[\\/]+$/, "");
  const base = clean.split(/[\\/]/).pop() || "backup";
  return `${base}.zip`;
}

/** Cuenta archivos y peso de `source` sin comprimir nada (preview para la UI). */
export function estimateBackup(source: string): Promise<BackupEstimate> {
  if (!isTauri()) throw new Error("El backup requiere la app instalada.");
  return invoke<BackupEstimate>("backup_estimate", { source });
}

/** Marca la operación en curso para que corte en el próximo punto de chequeo. */
export function cancelBackup(): Promise<void> {
  if (!isTauri()) return Promise.resolve();
  return invoke("backup_cancel");
}

/**
 * Comprime `source`, lo sube a la carpeta de backups y reemplaza al anterior.
 * Devuelve el nombre del zip subido.
 */
export async function runBackup(
  source: string,
  onProgress: (p: BackupProgress) => void,
): Promise<{ name: string; bytes: number }> {
  if (!isTauri()) throw new Error("El backup requiere la app instalada.");

  const token = await getAccessToken();
  if (!token) throw new Error("No hay una cuenta de Google Drive conectada.");

  const folder = await googleDriveProvider.ensureFolder(token, BACKUP_FOLDER);
  const name = zipNameFor(source);

  // Los backups previos con este mismo nombre se resuelven ANTES de subir, pero
  // se borran DESPUÉS: si la subida se cae, el viejo sigue siendo recuperable.
  const previous = (await googleDriveProvider.list(token, folder.id)).filter(
    (f) => !f.isFolder && f.name === name,
  );

  // El tamaño final lo sabemos recién cuando Rust termina de comprimir.
  let bytes = 0;
  const on = new Channel<BackupProgress>();
  on.onmessage = (p) => {
    if (p.phase === "zipped") bytes = p.bytes;
    onProgress(p);
  };

  const newId = await invoke<string>("backup_run", {
    source,
    accessToken: token,
    folderId: folder.id,
    fileName: name,
    on,
  });

  // Best-effort: si falla el borrado del viejo, el backup nuevo ya está arriba y
  // eso es lo que importa — quedan dos archivos con el mismo nombre, no se pierde nada.
  for (const old of previous) {
    if (old.id === newId) continue;
    try {
      await googleDriveProvider.delete(token, old.id);
    } catch {
      // Ignorado a propósito (ver arriba).
    }
  }

  return { name, bytes };
}
