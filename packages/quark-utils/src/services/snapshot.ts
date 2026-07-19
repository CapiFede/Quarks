/**
 * Bridge a los scripts del repo de dotfiles (`~/.dotfiles`) para el tab System.
 *
 * La lógica vive en los scripts del repo (`snapshot.sh`, `lib/do-remove.sh`,
 * `lib/do-hide.sh`): acá solo resolvemos rutas absolutas y armamos el comando que
 * ejecuta `runScript`. Así NO duplicamos lógica entre Quarks y el repo, y el
 * restore en una PC nueva funciona sin Quarks (`bash ~/.dotfiles/restore.sh`).
 *
 * Reemplaza al flujo anterior basado en chezmoi: el estado del sistema (paquetes
 * + configs de KDE) vive en un repo git en `~/.dotfiles`, y los botones del tab
 * System invocan sus scripts:
 *   - snapshot  → captura el estado actual y lo pushea (como usuario).
 *   - aplicar   → remueve paquetes (root, vía pkexec) + aplica ocultar (usuario).
 *   - editar    → abre remove.txt / hide.txt en el editor por defecto.
 */
import { homeDir, join } from "@tauri-apps/api/path";

/** Comilla simple para shell: envuelve y escapa comillas internas. */
function sq(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** Rutas absolutas dentro del repo de dotfiles. */
export interface DotfilesPaths {
  repo: string;
  snapshot: string;
  doRemove: string;
  doHide: string;
  removeTxt: string;
  hideTxt: string;
}

/** Resuelve las rutas del repo `~/.dotfiles` usando la home real del usuario. */
export async function dotfilesPaths(): Promise<DotfilesPaths> {
  const repo = await join(await homeDir(), ".dotfiles");
  return {
    repo,
    snapshot: await join(repo, "snapshot.sh"),
    doRemove: await join(repo, "lib", "do-remove.sh"),
    doHide: await join(repo, "lib", "do-hide.sh"),
    removeTxt: await join(repo, "packages", "remove.txt"),
    hideTxt: await join(repo, "desktop", "hide.txt"),
  };
}

/**
 * Antepone un chequeo de existencia: si falta el script/archivo (repo sin clonar,
 * ruta movida), corta con un mensaje claro en vez de un error críptico.
 */
function guarded(path: string, cmd: string): string {
  return [
    `if [ ! -e ${sq(path)} ]; then`,
    `  echo "✗ No existe ${path}"`,
    `  echo "  ¿Está el repo en ~/.dotfiles? Cloná: git clone <url> ~/.dotfiles"`,
    `  exit 1`,
    `fi`,
    cmd,
  ].join("\n");
}

/** Snapshot: captura el estado y lo pushea. Corre como USUARIO (privileged=false). */
export function snapshotScript(p: DotfilesPaths): string {
  return guarded(p.snapshot, `bash ${sq(p.snapshot)}`);
}

/** Remoción de paquetes (remove.txt). Corre como ROOT (privileged=true). */
export function applyRemoveScript(p: DotfilesPaths): string {
  return guarded(p.doRemove, `bash ${sq(p.doRemove)}`);
}

/** Aplicación de ocultar (hide.txt). Corre como USUARIO (privileged=false). */
export function applyHideScript(p: DotfilesPaths): string {
  return guarded(p.doHide, `bash ${sq(p.doHide)}`);
}

/** Abre un archivo en el editor por defecto (xdg-open). Corre como USUARIO. */
export function openFileScript(path: string): string {
  return guarded(path, `xdg-open ${sq(path)} >/dev/null 2>&1 &`);
}
