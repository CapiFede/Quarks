/**
 * Integración con los controles de media del SO (MPRIS), Linux-only por ahora.
 *
 * Dos direcciones:
 *   - OS → app: `listenMediaKeys` escucha el evento Tauri `mpris:event` (que
 *     emite el backend cuando llega una tecla multimedia o un click en el widget
 *     del reproductor) y dispara los handlers del store.
 *   - app → OS: `setMetadata` / `setPlayback` empujan al widget qué suena y el
 *     estado de reproducción (los comandos viven en `src-tauri/src/mpris.rs`).
 *
 * Fuera de Linux todo es no-op: los flags `isLinux` cortan antes de invocar, y
 * los comandos del backend son stubs igualmente. Cualquier error de invoke se
 * traga en silencio: MPRIS es un extra, nunca debe romper la reproducción.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isLinux } from "@quarks/core";

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

interface MprisEvent {
  action: "play" | "pause" | "toggle" | "next" | "prev" | "stop" | "seek";
  positionSec: number | null;
}

export type PlaybackStatus = "playing" | "paused" | "stopped";

/**
 * Empieza a escuchar las teclas/controles de media. Devuelve una función para
 * dejar de escuchar (no-op fuera de Linux).
 */
export async function listenMediaKeys(handlers: MediaKeyHandlers): Promise<UnlistenFn> {
  if (!isLinux) return () => {};
  return listen<MprisEvent>("mpris:event", ({ payload }) => {
    switch (payload.action) {
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
        if (payload.positionSec != null) handlers.seek(payload.positionSec);
        break;
    }
  });
}

/** Refleja el track actual en el widget del SO. */
export async function setMetadata(meta: {
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
}): Promise<void> {
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
  if (!isLinux) return;
  try {
    await invoke("mpris_set_playback", { status, positionSec });
  } catch {
    // idem setMetadata.
  }
}
