/**
 * `list_dir`: lista entradas de un directorio dentro del workspace.
 *
 * Devuelve archivos y subcarpetas como un listado compacto, con un sufijo `/`
 * para distinguir carpetas. Tope de 500 entradas (las carpetas con miles de
 * items rompen el contexto sin aportar info útil).
 */
import { resolveInWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";

const MAX_ENTRIES = 500;

interface Args {
  path?: string;
}

export const listDir: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "list_dir",
      description:
        "Lista archivos y subcarpetas del directorio indicado (relativo al workspace). Si no pasás path, lista la raíz.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa; vacío = raíz del workspace." },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { path = "" } = (rawArgs as Args) ?? {};
    const full = resolveInWorkspace(ctx.workspaceRoot, path);
    const { BaseDirectory, exists, readDir } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(full, { baseDir: BaseDirectory.AppData }))) {
      return { content: `list_dir: no existe \`${path || "."}\``, isError: true };
    }
    const entries = await readDir(full, { baseDir: BaseDirectory.AppData });
    const items = entries
      .filter((e) => !e.name.endsWith(".tmp"))
      .map((e) => (e.isDirectory ? `${e.name}/` : e.name))
      .sort();
    const truncated = items.length > MAX_ENTRIES;
    const shown = truncated ? items.slice(0, MAX_ENTRIES) : items;
    const header = `# ${path || "."} (${items.length} entrada${items.length === 1 ? "" : "s"}${truncated ? `, truncado a ${MAX_ENTRIES}` : ""})\n`;
    return { content: header + shown.join("\n") };
  },
};
