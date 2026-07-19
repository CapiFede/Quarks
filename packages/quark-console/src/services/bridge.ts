/**
 * Bridge tipado a los comandos Tauri del console quark (`src-tauri/src/console`).
 *
 * - `open` / `write` / `resize` / `close` mapean 1:1 a los `tauri::command` del
 *   backend. Los bytes en `write` se mandan en base64 porque Tauri serializa
 *   los args como JSON (`Uint8Array` ahí queda como array de números, 3-4× el
 *   tamaño; base64 es ~1.33×).
 * - `onOutput` / `onExit` / `onCwd` se suscriben a los eventos por sesión que
 *   emite el backend (`console:output:<id>` etc.); devuelven el unlisten.
 *
 * Toda la API es no-op fuera de Tauri (vite-dev en navegador).
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface OpenOptions {
  id: string;
  shell?: string;
  args?: string[];
  cwd?: string;
  cols: number;
  rows: number;
  elevated?: boolean;
  /** Variables de entorno extra (p. ej. `POWERSHELL_UPDATECHECK=Off`). */
  env?: [string, string][];
}

export interface ShellOption {
  id: string;
  label: string;
  program: string;
  args: string[];
  env: [string, string][];
  available: boolean;
}

export interface OpenResult {
  shell: string;
}

interface OutputEvent {
  b64: string;
}

interface ExitEvent {
  code: number;
}

interface CwdEvent {
  cwd: string;
}

export async function open(opts: OpenOptions): Promise<OpenResult> {
  if (!isTauri()) {
    return { shell: opts.shell ?? "powershell.exe" };
  }
  return invoke<OpenResult>("console_open", { args: opts });
}

export async function write(id: string, data: Uint8Array): Promise<void> {
  if (!isTauri()) return;
  const b64 = bytesToBase64(data);
  await invoke("console_write", { id, dataB64: b64 });
}

export async function resize(id: string, cols: number, rows: number): Promise<void> {
  if (!isTauri()) return;
  await invoke("console_resize", { id, cols, rows });
}

export async function close(id: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("console_close", { id });
}

export async function defaultShell(): Promise<string> {
  if (!isTauri()) return "powershell.exe";
  return invoke<string>("console_default_shell");
}

export async function listShells(): Promise<ShellOption[]> {
  if (!isTauri()) return [];
  return invoke<ShellOption[]>("console_list_shells");
}

export async function onOutput(
  id: string,
  cb: (bytes: Uint8Array) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<OutputEvent>(`console:output:${id}`, (e) => {
    cb(base64ToBytes(e.payload.b64));
  });
}

export async function onExit(
  id: string,
  cb: (code: number) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<ExitEvent>(`console:exit:${id}`, (e) => cb(e.payload.code));
}

export async function onCwd(
  id: string,
  cb: (cwd: string) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) return () => {};
  return listen<CwdEvent>(`console:cwd:${id}`, (e) => cb(e.payload.cwd));
}

// ── base64 utils ──────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  // Camino chunked para no reventar el stack con strings gigantes
  // (`String.fromCharCode(...bytes)` puede excederlo en chunks grandes).
  let s = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[],
    );
  }
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
