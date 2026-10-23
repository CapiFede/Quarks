/**
 * IO del music quark.
 *
 * Las operaciones de archivos (escaneo, tags, portadas, borrar/renombrar) son
 * comandos Tauri Rust en TODAS las plataformas (incluido Android).
 *
 * La REPRODUCCIÓN tiene dos implementaciones:
 *   - Desktop: comandos Tauri que hablan con el thread de audio de rodio.
 *   - Android: `HTMLAudioElement` en el WebView (ver `androidPlayer.ts`),
 *     porque rodio no tiene backend Android viable hoy.
 * El dispatch ocurre acá según `isAndroid` para que el store no se entere.
 *
 * Las rutas de tracks son RELATIVAS a la carpeta de canciones: así las playlists
 * son portables (sobreviven al sync entre máquinas). En desktop, el backend
 * resuelve a absoluto al reproducir; en Android, `androidPlayer` lee el archivo
 * desde `<AppData>/packages/music/songs/<rel>` vía el fs plugin.
 */
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { isAndroid } from "@quarks/core";
import * as android from "./androidPlayer";
import type { NativeStatus } from "./androidPlayer";
import type { Track } from "../types";

export type { NativeStatus } from "./androidPlayer";

/** Escaneo recursivo de la carpeta de canciones; tracks con ruta relativa. */
export function scan(): Promise<Track[]> {
  return invoke<Track[]>("music_scan");
}

/** Carga el archivo (ruta relativa) y empieza a reproducir desde el inicio. */
export async function play(path: string, volume: number): Promise<void> {
  if (isAndroid) return android.play(path, volume);
  await invoke("music_play", { path, volume });
}

export async function pause(): Promise<void> {
  if (isAndroid) return android.pause();
  await invoke("music_pause");
}

export async function resume(): Promise<void> {
  if (isAndroid) return android.resume();
  await invoke("music_resume");
}

export async function stop(): Promise<void> {
  if (isAndroid) return android.stop();
  await invoke("music_stop");
}

export async function seek(secs: number): Promise<void> {
  if (isAndroid) return android.seek(secs);
  await invoke("music_seek", { secs });
}

/** Volumen en 0..1. */
export async function setVolume(v: number): Promise<void> {
  if (isAndroid) return android.setVolume(v);
  await invoke("music_set_volume", { v });
}

/**
 * Estado real del reproductor cuando lo maneja el WebView (Android): posición,
 * duración decodificada y fin de track. En desktop devuelve `null` — rodio no
 * lo expone y el store estima la posición con su propio timer.
 */
export function nativeStatus(): NativeStatus | null {
  return isAndroid ? android.status() : null;
}

/** Ruta absoluta de la carpeta de canciones (la crea si no existe). */
export function songsDir(): Promise<string> {
  return invoke<string>("music_songs_dir");
}

/**
 * Abre la carpeta de canciones en el explorador del SO. En Android no hay
 * explorador asociado al sandbox privado de la app — la función es no-op.
 */
export async function revealFolder(): Promise<void> {
  if (isAndroid) return;
  await openPath(await songsDir());
}

/** Borra el archivo del track del disco y lo quita de todas las playlists. */
export async function deleteTrack(path: string): Promise<void> {
  await invoke("music_delete_track", { path });
}

/** Renombra el archivo (mantiene extensión y carpeta) y actualiza las playlists.
 * Devuelve la nueva ruta relativa. */
export function renameTrack(path: string, newName: string): Promise<string> {
  return invoke<string>("music_rename_track", { path, newName });
}

/** Devuelve la portada embebida del MP3 como data URL, o null si no tiene. */
export function getCover(path: string): Promise<string | null> {
  return invoke<string | null>("music_get_cover", { path });
}

/** Embebe la imagen `dataUrl` (`data:<mime>;base64,…`) como portada del track. */
export async function setCover(path: string, dataUrl: string): Promise<void> {
  await invoke("music_set_cover_data", { path, dataUrl });
}

/** Abre el selector de archivos (JPG, PNG o WebP) para elegir la portada.
 * Devuelve la ruta absoluta o `null` si se canceló. Desktop-only. */
export function pickImage(): Promise<string | null> {
  return invoke<string | null>("music_pick_image");
}

/** Lee la imagen del archivo absoluto `imagePath` como data URL. */
export function readImage(imagePath: string): Promise<string> {
  return invoke<string>("music_read_image", { imagePath });
}

/** Baja la miniatura del video de YouTube del link `url` como data URL. Solo
 * la imagen, no el audio. Desktop-only. */
export function youtubeThumb(url: string): Promise<string> {
  return invoke<string>("music_youtube_thumb", { url });
}
