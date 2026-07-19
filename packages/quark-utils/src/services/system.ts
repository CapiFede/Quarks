/**
 * Bridge tipado al comando Tauri `system_run_script` (`src-tauri/src/system.rs`).
 *
 * `runScript` corre un script de shell y entrega su salida línea por línea vía
 * el callback `onLine`, resolviendo con el exit code cuando termina. Genera un
 * id de ejecución único por llamada para namespacear los eventos por sesión
 * (`system:output:<id>` / `system:exit:<id>`) — así dos scripts corriendo a la
 * vez no se pisan el stream.
 *
 * Fuera de Tauri (vite-dev en browser) es no-op: emite una línea de aviso y
 * resuelve con 0, para poder iterar la UI sin backend.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface OutputEvent {
  line: string;
}
interface ExitEvent {
  code: number;
}

/**
 * Corre `script` (bash). Si `privileged`, se eleva vía `pkexec` (un solo
 * diálogo de polkit). `onLine` recibe cada línea de stdout/stderr en vivo.
 * Resuelve con el exit code (0 = ok). Rechaza solo si el spawn falla.
 */
export async function runScript(
  label: string,
  script: string,
  privileged: boolean,
  onLine: (line: string) => void,
): Promise<number> {
  if (!isTauri()) {
    onLine(`[dev] sin Tauri — script "${label}" no ejecutado.`);
    return 0;
  }

  // Id único: el label sanitizado + un sufijo aleatorio, para que el backend
  // namespacee el archivo temporal y los canales de evento de ESTA ejecución.
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 32) || "run";
  const id = `${safe}-${crypto.randomUUID().slice(0, 8)}`;

  let unOut: UnlistenFn = () => {};
  let unExit: UnlistenFn = () => {};
  unOut = await listen<OutputEvent>(`system:output:${id}`, (e) => onLine(e.payload.line));
  return new Promise<number>((resolve, reject) => {
    void (async () => {
      unExit = await listen<ExitEvent>(`system:exit:${id}`, (e) => {
        unOut();
        unExit();
        resolve(e.payload.code);
      });
      try {
        await invoke("system_run_script", { args: { id, script, privileged } });
      } catch (err) {
        unOut();
        unExit();
        reject(err);
      }
    })();
  });
}
