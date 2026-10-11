/**
 * Tareas largas que tienen que seguir corriendo con la pantalla apagada.
 *
 * En Android, con la pantalla apagada el SO duerme la CPU y le corta la red a
 * las apps en background: la playlist de Música se corta al terminar el track
 * en curso y una bajada larga del sync muere a mitad. Mientras haya una tarea
 * activa, el `BackgroundService` nativo (`src-tauri/gen/android/.../
 * BackgroundService.kt`) mantiene la app en foreground, con una notificación y
 * un wakelock. MainActivity lo expone como `window.QuarksBackground`.
 *
 * En desktop es no-op: ahí nada se duerme con la app abierta.
 */
import { isAndroid } from "./platform";

/** Tareas que conoce el servicio nativo (cada una con su tipo de foreground service). */
export type BackgroundTask = "music" | "sync";

interface Bridge {
  start(task: string, text: string): void;
  stop(task: string): void;
  stopAll(): void;
}

const bridge = isAndroid
  ? (window as { QuarksBackground?: Bridge }).QuarksBackground
  : undefined;

/** Tarea activa → último texto enviado (evita llamadas repetidas al puente). */
const active = new Map<BackgroundTask, string>();

// Las tareas de una página anterior quedan colgadas en el servicio sin nadie
// que las cierre (un reload, p. ej. el que hace el sync tras bajar): de cero.
bridge?.stopAll();

/** Marca la tarea como activa. `text` va a la notificación; llamar de nuevo lo cambia. */
export function startBackgroundTask(task: BackgroundTask, text: string): void {
  if (!bridge || active.get(task) === text) return;
  active.set(task, text);
  bridge.start(task, text);
}

/** La tarea terminó: si no queda ninguna, el servicio se va. */
export function endBackgroundTask(task: BackgroundTask): void {
  if (!bridge || !active.delete(task)) return;
  bridge.stop(task);
}
