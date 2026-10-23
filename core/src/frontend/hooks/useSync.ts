import { useCallback, useEffect, useRef, useState } from "react";
import {
  computeSyncState,
  push as pushSync,
  pull as pullSync,
  type SyncPreview,
  type SyncProgress,
} from "../../services/account/sync";
import { endBackgroundTask, startBackgroundTask } from "../../services/background";
import { report } from "../../services/log";
import { messageOf } from "../../services/util";

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


/**
 * Estado del motor de sync para la UI. Vive en el Shell (no en el panel de
 * Settings) para que una operación larga sobreviva a cerrar el popup y el botón
 * Cancelar siga alcanzándola. El `check` automático lo dispara el panel al
 * abrirse; `enabled` (hay cuenta conectada) en false aborta y limpia. Un ref
 * `busy` serializa las operaciones; un `AbortController` permite cancelarlas.
 * Mientras corre una, es tarea en background: en Android sigue aunque se
 * apague la pantalla.
 *
 * Tras un pull exitoso recargamos el WebView entero (`window.location.reload`):
 * el pull reescribe el árbol en disco por debajo de los stores ya montados
 * (playlists, settings, notas…), que no releen solos. Remontar todo es la forma
 * más simple y consistente de que cada quark tome su estado ya actualizado del
 * disco; equivale a un F5.
 */
export function useSync(enabled: boolean): SyncController {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [status, setStatus] = useState<SyncOp>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const run = useCallback(
    async (
      op: Exclude<SyncOp, "idle" | "error">,
      action?: (signal: AbortSignal, onProgress: (p: SyncProgress) => void) => Promise<void>,
    ) => {
      if (busy.current) return;
      busy.current = true;
      startBackgroundTask("sync", "Sincronizando con Google Drive");
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
        // Si en el medio se desconectó la cuenta, no hay contra qué re-chequear.
        if (!enabledRef.current) {
          setStatus("idle");
          return;
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
        setError(messageOf(e));
        setStatus("error");
      } finally {
        controller.current = null;
        setProgress(null);
        busy.current = false;
        endBackgroundTask("sync");
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
        // Solo llegamos acá si el pull terminó OK (cancelar o fallar lanzan antes):
        // recargamos para que la UI refleje el árbol recién bajado a disco. El
        // re-check posterior de `run` queda abortado por la navegación (inofensivo).
        window.location.reload();
      }),
    [run],
  );

  const cancel = useCallback(() => controller.current?.abort(), []);

  useEffect(() => {
    if (enabled) return;
    // Cuenta desconectada: abortamos lo que haya y limpiamos el resumen.
    controller.current?.abort();
    setPreview(null);
    setError(null);
    setStatus("idle");
  }, [enabled]);

  return { preview, status, error, progress, check, push, pull, cancel };
}
