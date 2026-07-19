/**
 * `edit_file`: reemplazo exacto de string en un archivo del workspace.
 *
 * Mutante: solo Agent, requiere aprobación. El `oldString` tiene que ser único
 * en el archivo (si aparece varias veces, fallamos con error claro — el modelo
 * debe ampliar el contexto y reintentar). Misma filosofía que la tool `Edit` de
 * Claude Code: cero tolerancia a coincidencias ambiguas.
 *
 * Diff: incluímos el contexto antes/después en el contenido del result para que
 * la UI de aprobación pueda mostrarlo prolijo (M4 polish).
 */
import { resolveInWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";

interface Args {
  path: string;
  oldString: string;
  newString: string;
}

export const editFile: ToolDef = {
  availableInAsk: false,
  requiresApproval: true,
  schema: {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Reemplaza exactamente `oldString` por `newString` en el archivo indicado. `oldString` debe aparecer una sola vez (si no, falla — agregá más contexto y reintenta). Requiere aprobación.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          oldString: { type: "string" },
          newString: { type: "string" },
        },
        required: ["path", "oldString", "newString"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { path, oldString, newString } = rawArgs as Args;
    const full = resolveInWorkspace(ctx.workspaceRoot, path);
    const { BaseDirectory, exists, readTextFile, writeTextFile, rename } = await import(
      "@tauri-apps/plugin-fs"
    );
    if (!(await exists(full, { baseDir: BaseDirectory.AppData }))) {
      return { content: `edit_file: no existe \`${path}\``, isError: true };
    }
    const before = await readTextFile(full, { baseDir: BaseDirectory.AppData });
    const occurrences = countOccurrences(before, oldString);
    if (occurrences === 0) {
      return { content: `edit_file: \`oldString\` no aparece en ${path}`, isError: true };
    }
    if (occurrences > 1) {
      return {
        content: `edit_file: \`oldString\` aparece ${occurrences} veces en ${path}. Agregá más contexto para que sea único.`,
        isError: true,
      };
    }
    const after = before.replace(oldString, newString);
    const tmp = `${full}.tmp`;
    await writeTextFile(tmp, after, { baseDir: BaseDirectory.AppData });
    await rename(tmp, full, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
    const removed = oldString.split("\n").length;
    const added = newString.split("\n").length;
    return { content: `edit_file: ${path} · -${removed} +${added} líneas` };
  },
};

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}
