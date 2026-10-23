import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkForUpdate,
  downloadAndInstall,
  type DownloadProgress,
  type UpdateInfo,
} from "../../services/updater";
import { report } from "../../services/log";
import { messageOf } from "../../services/util";

export type UpdaterStatus =
  | "idle" // nunca chequeamos en esta sesión
  | "checking" // hay un check() en curso
  | "uptodate" // chequeo OK, no hay nueva versión
  | "available" // chequeo OK, hay update — esperando que el usuario lo instale
  | "downloading" // instalación en curso
  | "error";

export interface UpdaterController {
  status: UpdaterStatus;
  update: UpdateInfo | null;
  progress: DownloadProgress | null;
  error: string | null;
  /** Chequeo manual (botón "Buscar actualizaciones" en Settings). */
  check: () => Promise<void>;
  /** Descarga + instala + reinicia. Usable solo cuando `status === "available"`. */
  install: () => Promise<void>;
  /** Descarta el banner de "update disponible" sin instalar (usuario decide después). */
  dismiss: () => void;
}

/**
 * Estado de updates con auto-check al montar (silencioso: no muestra error si
 * falla, solo lo loguea). El botón manual de Settings llama `check()` y sí
 * expone el resultado en UI — esa es la diferencia entre auto y manual.
 *
 * El ref `busy` evita disparar dos flujos en paralelo (p. ej. el auto-check del
 * boot pisándose con un click manual rápido).
 */
export function useUpdater(): UpdaterController {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  /** Chequeo interno; `silent` decide si propagamos errores a la UI o solo los logueamos. */
  const runCheck = useCallback(async (silent: boolean) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    if (!silent) setStatus("checking");
    try {
      const info = await checkForUpdate({ silent });
      if (info) {
        setUpdate(info);
        setStatus("available");
      } else {
        setUpdate(null);
        // Si fue silent y no hay nada, no movemos el status — sigue "idle" para
        // que el botón de Settings muestre su label por defecto hasta que el
        // usuario chequee manualmente.
        if (!silent) setStatus("uptodate");
      }
    } catch (e) {
      report("updater.check", e);
      if (!silent) {
        setError(messageOf(e));
        setStatus("error");
      }
    } finally {
      busy.current = false;
    }
  }, []);

  const check = useCallback(() => runCheck(false), [runCheck]);

  const install = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setStatus("downloading");
    setProgress({ downloaded: 0, total: null });
    try {
      await downloadAndInstall((p) => setProgress(p));
      // Si llegamos acá, el relaunch se disparó — la app está por reiniciar,
      // así que no tiene mucho sentido tocar el estado.
    } catch (e) {
      report("updater.install", e);
      setError(messageOf(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, []);

  const dismiss = useCallback(() => {
    setUpdate(null);
    setStatus("idle");
  }, []);

  // Auto-check al arrancar: silencioso, sin bloquear el render. Si el server
  // está caído o no hay red el usuario no se entera — el botón manual sigue
  // disponible para reintentar.
  useEffect(() => {
    void runCheck(true);
  }, [runCheck]);

  return { status, update, progress, error, check, install, dismiss };
}
