/**
 * Sandbox de paths para las tools de filesystem.
 *
 * Todas las tools FS reciben paths del modelo (no del usuario directo): hay que
 * tratarlos como input no confiable. La estrategia es restringir TODO acceso a
 * la sub-jaula `workspaceRoot` dentro de AppData; el modelo pasa rutas
 * relativas a esa raíz y nosotros normalizamos + rechazamos cualquier escape.
 *
 * Por qué relativo a AppData en lugar de paths absolutos: simplifica el modelo
 * mental (no hay que pensar en `C:\` ni paths UNC), y la verificación es chica
 * — no permite `..` que salgan de la raíz, no permite drive letters, no permite
 * paths absolutos POSIX. Si algún día el workspace root apunta a una carpeta
 * arbitraria, este módulo es el único que cambia.
 */

export class PathSandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSandboxError";
  }
}

/**
 * Devuelve la ruta relativa a AppData (formato POSIX) lista para usar con
 * `@tauri-apps/plugin-fs` + `BaseDirectory.AppData`. Lanza `PathSandboxError`
 * si el path intenta escapar la jaula o tiene un formato inválido.
 *
 * Reglas:
 *  - Slashes \\ se normalizan a /.
 *  - Vacío y "/" → la raíz del workspace.
 *  - No se permite arrancar con `C:`, `D:`, etc. (drive letter Windows).
 *  - No se permite path absoluto POSIX (`/foo`).
 *  - `..` se aceptan SOLO si no superan la raíz (sea relativos al workspace).
 *  - Caracteres prohibidos: NUL.
 */
export function resolveInWorkspace(workspaceRoot: string, raw: string): string {
  if (typeof raw !== "string") throw new PathSandboxError("Path inválido.");
  if (raw.includes("\0")) throw new PathSandboxError("Path con caracter nulo.");

  // Normalizar a forward slashes y limpiar dobles.
  let p = raw.replace(/\\/g, "/").trim();

  // Rechazar drive letters de Windows (`C:`, `C:/`, `c:foo`).
  if (/^[a-zA-Z]:/.test(p)) {
    throw new PathSandboxError("No se permiten paths absolutos con drive letter.");
  }
  // Rechazar paths absolutos POSIX (queremos solo relativos al workspace).
  if (p.startsWith("/")) {
    throw new PathSandboxError("No se permiten paths absolutos. Usá una ruta relativa al workspace.");
  }

  // Resolver segmentos `.` y `..`.
  const segments = p.split("/").filter((s) => s.length > 0 && s !== ".");
  const stack: string[] = [];
  for (const seg of segments) {
    if (seg === "..") {
      if (stack.length === 0) {
        throw new PathSandboxError("Path escapa del workspace (demasiados `..`).");
      }
      stack.pop();
    } else {
      stack.push(seg);
    }
  }

  // Componer relativo al workspace root.
  const rootSegments = workspaceRoot.replace(/\\/g, "/").split("/").filter(Boolean);
  return [...rootSegments, ...stack].join("/");
}

/** Devuelve la ruta dentro del workspace SIN incluir el prefijo del root (display-only). */
export function relToWorkspace(workspaceRoot: string, full: string): string {
  const root = workspaceRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const f = full.replace(/\\/g, "/");
  if (f.startsWith(root + "/")) return f.slice(root.length + 1);
  return f;
}
