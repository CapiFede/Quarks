/**
 * `read_file`: lee un archivo de texto dentro del workspace.
 *
 * Soporta `offset` (línea inicial) y `limit` (líneas a leer) — útil para
 * inspeccionar archivos grandes sin saturar el contexto. Trunca a 64 KB para no
 * meterle un libro entero al modelo de un saque.
 */
import { resolveInWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";

const MAX_BYTES = 64 * 1024;

interface Args {
  path: string;
  offset?: number;
  limit?: number;
}

export const readFile: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Lee un archivo de texto del workspace. Devuelve el contenido (truncado a 64 KB). Acepta offset/limit en líneas para archivos grandes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Ruta relativa al workspace." },
          offset: { type: "integer", description: "Línea inicial (0-based).", minimum: 0 },
          limit: { type: "integer", description: "Cantidad máxima de líneas a devolver.", minimum: 1 },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { path, offset = 0, limit } = rawArgs as Args;
    const full = resolveInWorkspace(ctx.workspaceRoot, path);
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(full, { baseDir: BaseDirectory.AppData }))) {
      return { content: `read_file: no existe \`${path}\``, isError: true };
    }
    let text = await readTextFile(full, { baseDir: BaseDirectory.AppData });
    if (offset > 0 || limit !== undefined) {
      const lines = text.split("\n");
      text = lines.slice(offset, limit !== undefined ? offset + limit : undefined).join("\n");
    }
    let truncated = false;
    if (text.length > MAX_BYTES) {
      text = text.slice(0, MAX_BYTES);
      truncated = true;
    }
    const header = truncated
      ? `# ${path} (truncado a ${MAX_BYTES} chars)\n`
      : `# ${path}\n`;
    return { content: header + text };
  },
};
