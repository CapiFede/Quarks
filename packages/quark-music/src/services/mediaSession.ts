/**
 * Integración con los controles de media del SO.
 *
 * Linux (MPRIS), dos direcciones:
 *   - OS → app: `listenMediaKeys` escucha el evento Tauri `mpris:event` (que
 *     emite el backend cuando llega una tecla multimedia o un click en el widget
 *     del reproductor) y dispara los handlers del store.
 *   - app → OS: `setMetadata` / `setPlayback` empujan al widget qué suena y el
 *     estado de reproducción (los comandos viven en `src-tauri/src/mpris.rs`).
 *
 * Android, mismas dos direcciones contra `MusicSession.kt` (una MediaSession
 * nativa, expuesta como `window.QuarksMedia`):
 *   - OS → app: los botones de los auriculares/Bluetooth llegan como
 *     `window.quarksMediaKey(acción)`, que `listenMediaKeys` cablea al store.
 *   - app → OS: `setPlayback` le dice a la sesión si suena o está en pausa (de
 *     eso depende qué hace el botón de play/pausa) y marca la música como tarea
 *     en background (`startBackgroundTask` del core), que la mantiene viva con
 *     la pantalla apagada; sin eso, la playlist se corta al terminar el track.
 *
 * En el resto de las plataformas todo es no-op. Cualquier error de invoke se
 * traga en silencio: MPRIS es un extra, nunca debe romper la reproducción.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { endBackgroundTask, isAndroid, isLinux, startBackgroundTask } from "@quarks/core";

/** Acciones que el SO puede pedir; las cablea el store a sus métodos. */
export interface MediaKeyHandlers {
  toggle: () => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  seek: (sec: number) => void;
}

type MediaAction = "play" | "pause" | "toggle" | "next" | "prev" | "stop" | "seek";

interface MprisEvent {
  action: MediaAction;
  positionSec: number | null;
}

export type PlaybackStatus = "playing" | "paused" | "stopped";

/** Puente nativo de Android (`MusicSessionBridge` en `MusicSession.kt`). */
interface AndroidMedia {
  update(state: PlaybackStatus, title: string): void;
}

const androidWindow = window as {
  QuarksMedia?: AndroidMedia;
  /** Lo define `listenMediaKeys`; lo llama la sesión nativa con cada botón. */
  quarksMediaKey?: (action: MediaAction) => void;
};

// La sesión nativa sobrevive a un reload de la página (p. ej. tras bajar el
// sync) con el estado viejo: si quedó en "suena", el botón mandaría pausa a un
// reproductor que no está sonando. Arrancamos de cero.
if (isAndroid) androidWindow.QuarksMedia?.update("stopped", "");

function dispatch(handlers: MediaKeyHandlers, action: MediaAction, positionSec: number | null): void {
  switch (action) {
    case "toggle":
      handlers.toggle();
      break;
    case "play":
      handlers.play();
      break;
    case "pause":
      handlers.pause();
      break;
    case "next":
      handlers.next();
      break;
    case "prev":
      handlers.prev();
      break;
    case "stop":
      handlers.stop();
      break;
    case "seek":
      if (positionSec != null) handlers.seek(positionSec);
      break;
  }
}

/**
 * Empieza a escuchar las teclas/controles de media. Devuelve una función para
 * dejar de escuchar (no-op fuera de Linux y Android).
 */
export async function listenMediaKeys(handlers: MediaKeyHandlers): Promise<UnlistenFn> {
  if (isAndroid) {
    androidWindow.quarksMediaKey = (action) => dispatch(handlers, action, null);
    return () => {
      delete androidWindow.quarksMediaKey;
    };
  }
  if (!isLinux) return () => {};
  return listen<MprisEvent>("mpris:event", ({ payload }) =>
    dispatch(handlers, payload.action, payload.positionSec),
  );
}

/** Refleja el track actual en el widget del SO. */
export async function setMetadata(meta: {
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
}): Promise<void> {
  if (isAndroid) {
    androidTitle = meta.title ?? "";
    return;
  }
  if (!isLinux) return;
  try {
    await invoke("mpris_set_metadata", {
      title: meta.title ?? null,
      artist: meta.artist ?? null,
      album: meta.album ?? null,
      durationSec: meta.durationSec ?? null,
    });
  } catch {
    // MPRIS es opcional: si el servicio no está, seguimos sin él.
  }
}

/** Refleja el estado de reproducción (+ posición) en el widget del SO. */
export async function setPlayback(status: PlaybackStatus, positionSec: number): Promise<void> {
  if (isAndroid) {
    if (status === "playing") startBackgroundTask("music", androidTitle || "Música");
    else endBackgroundTask("music");
    androidWindow.QuarksMedia?.update(status, androidTitle);
    return;
  }
  if (!isLinux) return;
  try {
    await invoke("mpris_set_playback", { status, positionSec });
  } catch {
    // idem setMetadata.
  }
}

/** Título del track actual, para la notificación y la sesión de media en Android. */
let androidTitle = "";
