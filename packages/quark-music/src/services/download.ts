/**
 * IO de la descarga: comandos Tauri para gestionar yt-dlp + ffmpeg, probar URLs
 * y bajar audio normalizado a MP3. El progreso vuelve por `Channel` (patrón de
 * @tauri-apps/api/core), el error por el `Result` del comando.
 */
import { invoke, Channel } from "@tauri-apps/api/core";

export interface ToolsStatus {
  ytDlp: boolean;
  ffmpeg: boolean;
  ready: boolean;
}

export interface ProbeResult {
  title: string;
  thumbnail: string | null;
  isPlaylist: boolean;
  count: number;
  durationSec: number | null;
  uploader: string | null;
}

export type SetupProgress =
  | { phase: "started" }
  | { phase: "tool"; name: string; pct: number }
  | { phase: "done" };

export type DownloadProgress =
  | { phase: "item"; index: number; total: number; title: string }
  | { phase: "progress"; pct: number; speed: string | null; eta: string | null }
  | { phase: "converting" }
  | { phase: "saved"; relPath: string }
  | { phase: "done"; relPaths: string[] };

export interface DownloadOpts {
  url: string;
  customName: string | null;
  normalize: boolean;
  isPlaylist: boolean;
  embedThumbnail: boolean;
}

export function toolsStatus(): Promise<ToolsStatus> {
  return invoke<ToolsStatus>("music_tools_status");
}

export async function setupTools(onProgress: (p: SetupProgress) => void): Promise<void> {
  const on = new Channel<SetupProgress>();
  on.onmessage = onProgress;
  await invoke("music_tools_setup", { on });
}

export function probeUrl(url: string): Promise<ProbeResult> {
  return invoke<ProbeResult>("music_probe_url", { url });
}

export async function download(
  opts: DownloadOpts,
  onProgress: (p: DownloadProgress) => void,
): Promise<string[]> {
  const on = new Channel<DownloadProgress>();
  on.onmessage = onProgress;
  return invoke<string[]>("music_download", { opts, on });
}
