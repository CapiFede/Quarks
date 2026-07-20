import { useCallback, useEffect, useRef, useState } from "react";
import { loadAppState, saveAppState } from "../../services/appState";
import {
  CANCELLED,
  cancelBackup,
  estimateBackup,
  runBackup,
  type BackupEstimate,
  type BackupProgress,
} from "../../services/account/backup";
import { report } from "../../services/log";

export type BackupOp = "idle" | "running" | "error" | "done";

export interface BackupController {
  /** Ruta de la carpeta a respaldar (persistida en appState, device-local). */
  path: string;
  setPath: (p: string) => void;
  /** Persiste la ruta y recalcula el estimado. Se llama al salir del input. */
  commitPath: () => void;
  /** Abre el selector nativo de carpetas. */
  browse: () => Promise<void>;
  /** Archivos + peso de la carpeta, o `null` si la ruta no sirve. */
  estimate: BackupEstimate | null;
  status: BackupOp;
  progress: BackupProgress | null;
  error: string | null;
  /** Aviso no-crítico (p. ej. cancelado por el usuario). */
  notice: string | null;
  /** Nombre del último zip subido con éxito. */
  lastName: string | null;
  run: () => Promise<void>;
  cancel: () => void;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Estado del backup manual para la UI.
 *
 * La ruta se carga de `appState.json` al montar y se persiste al confirmarla
 * (blur del input o elección en el diálogo), no en cada tecla: escribir a disco
 * por pulsación no aporta nada.
 *
 * El estimado se recalcula al confirmar la ruta. Un `estimate` en `null` con
 * ruta no vacía significa que la carpeta no existe o no se puede leer, y eso
 * deshabilita el botón de backup.
 */
export function useBackup(): BackupController {
  const [path, setPath] = useState("");
  const [estimate, setEstimate] = useState<BackupEstimate | null>(null);
  const [status, setStatus] = useState<BackupOp>("idle");
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const busy = useRef(false);
  // Última ruta ya estimada: evita re-estimar una carpeta gorda en cada blur.
  const estimated = useRef<string | null>(null);

  const refreshEstimate = useCallback(async (p: string) => {
    const trimmed = p.trim();
    if (!trimmed) {
      setEstimate(null);
      estimated.current = null;
      return;
    }
    if (estimated.current === trimmed) return;
    estimated.current = trimmed;
    try {
      setEstimate(await estimateBackup(trimmed));
      setError(null);
    } catch (e) {
      // Ruta inexistente o ilegible: sin estimado, el botón queda deshabilitado.
      setEstimate(null);
      setError(msg(e));
    }
  }, []);

  // Carga inicial de la ruta guardada.
  useEffect(() => {
    void (async () => {
      try {
        const state = await loadAppState();
        if (!state.backupPath) return;
        setPath(state.backupPath);
        await refreshEstimate(state.backupPath);
      } catch (e) {
        report("backup.loadPath", e);
      }
    })();
  }, [refreshEstimate]);

  const persist = useCallback(async (p: string) => {
    try {
      // `saveAppState` mergea: no pisa los tabs ni el space activo del Shell.
      await saveAppState({ backupPath: p.trim() });
    } catch (e) {
      report("backup.savePath", e);
    }
  }, []);

  const commitPath = useCallback(() => {
    void persist(path);
    void refreshEstimate(path);
  }, [path, persist, refreshEstimate]);

  const browse = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({ directory: true, multiple: false });
      if (typeof picked !== "string") return;
      setPath(picked);
      await persist(picked);
      await refreshEstimate(picked);
    } catch (e) {
      report("backup.browse", e);
      setError(msg(e));
    }
  }, [persist, refreshEstimate]);

  const run = useCallback(async () => {
    if (busy.current) return;
    const trimmed = path.trim();
    if (!trimmed) return;
    busy.current = true;
    setError(null);
    setNotice(null);
    setProgress(null);
    setStatus("running");
    try {
      const { name } = await runBackup(trimmed, setProgress);
      setLastName(name);
      setStatus("done");
    } catch (e) {
      const text = msg(e);
      // Cancelar es una decisión del usuario, no una falla: va como aviso.
      if (text.includes(CANCELLED)) {
        setNotice(text);
        setStatus("idle");
      } else {
        report("backup.run", e);
        setError(text);
        setStatus("error");
      }
    } finally {
      setProgress(null);
      busy.current = false;
    }
  }, [path]);

  const cancel = useCallback(() => void cancelBackup(), []);

  return {
    path,
    setPath,
    commitPath,
    browse,
    estimate,
    status,
    progress,
    error,
    notice,
    lastName,
    run,
    cancel,
  };
}
