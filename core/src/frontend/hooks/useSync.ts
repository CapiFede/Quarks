import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSyncState,
  push as pushSync,
  pull as pullSync,
  type SyncPreview,
  type SyncProgress,
} from "../../services/account/sync";
import { report } from "../../services/log";

export type SyncOp = "idle" | "checking" | "pushing" | "pulling" | "error";

export interface SyncController {
  preview: SyncPreview | null;
  status: SyncOp;
  error: string | null;
  /** Progreso de la operación en curso, o `null` si no hay ninguna. */
  progress: SyncProgress | null;
  /** Recalcula el resumen contra la nube. */
  check: () => Promise<void>;
  /** Sube los cambios locales y refresca el resumen. */
  push: () => Promise<void>;
  /** Baja los cambios de la nube y refresca el resumen. */
  pull: () => Promise<void>;
  /** Aborta la operación en curso (loop + request en vuelo). */
  cancel: () => void;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Estado del motor de sync para la UI. Hace un `check` automático al montar (el
 * panel solo se monta cuando hay cuenta conectada). Un ref `busy` serializa las
 * operaciones; un `AbortController` permite cancelarlas.
 *
 * `onAfterPull` se invoca tras un pull exitoso para re-hidratar en caliente los
 * stores que el pull tocó en disco (p. ej. `settings.json`), sin reiniciar.
 */
export function useSync(onAfterPull?: () => void): SyncController {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [status, setStatus] = useState<SyncOp>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (
      op: Exclude<SyncOp, "idle" | "error">,
      action?: (signal: AbortSignal, onProgress: (p: SyncProgress) => void) => Promise<void>,
    ) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      setProgress(null);
      setStatus(op);
      try {
        if (action) {
          const ctrl = new AbortController();
          controller.current = ctrl;
          try {
            await action(ctrl.signal, setProgress);
          } catch (e) {
            // Cancelar la acción no es un error: caemos al re-check (con signal
            // nuevo) para que los contadores reflejen lo ya transferido.
            if (!ctrl.signal.aborted) throw e;
          }
        }
        // Re-check SIEMPRE, con un signal NUEVO: tras cancelar, lo ya subido/bajado
        // deja de aparecer en el resumen (antes quedaba el preview viejo hasta un F5).
        const ctrl = new AbortController();
        controller.current = ctrl;
        setStatus("checking");
        setProgress(null);
        try {
          setPreview(await computeSyncState({ signal: ctrl.signal, onProgress: setProgress }));
          setStatus("idle");
        } catch (e) {
          if (!ctrl.signal.aborted) throw e;
          setStatus("idle"); // cancelaron el re-check: dejamos el preview que haya.
        }
      } catch (e) {
        report(`sync.${op}`, e);
        setError(msg(e));
        setStatus("error");
      } finally {
        controller.current = null;
        setProgress(null);
        busy.current = false;
      }
    },
    [],
  );

  const check = useCallback(() => run("checking"), [run]);
  const push = useCallback(() => run("pushing", (signal, onProgress) => pushSync({ signal, onProgress })), [run]);
  const pull = useCallback(
    () =>
      run("pulling", async (signal, onProgress) => {
        await pullSync({ signal, onProgress });
        onAfterPull?.();
      }),
    [run, onAfterPull],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  useEffect(() => {
    // Check automático al montar. NO abortamos en el cleanup: en dev StrictMode
    // monta/desmonta/monta, y abortar acá cancelaba este primer check (el segundo
    // queda bloqueado por el guard `busy`), dejándolo colgado en "Revisando…".
    // La cancelación es explícita vía `cancel` (botón Cancelar).
    void check();
  }, [check]);

  return { preview, status, error, progress, check, push, pull, cancel };
}
