/**
 * `write_file`: crea o sobrescribe un archivo de texto en el workspace.
 *
 * Mutante: solo Agent mode, requiere aprobación del usuario antes de ejecutar.
 * Es escritura atómica (tmp + rename) — el mismo patrón que el resto del core.
 */
import { resolveInWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";

interface Args {
  path: string;
  content: string;
}

export const writeFile: ToolDef = {
  availableInAsk: false,
  requiresApproval: true,
  schema: {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Crea o sobrescribe un archivo de texto. Path relativo al workspace. Requiere aprobación del usuario.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { path, content } = rawArgs as Args;
    const full = resolveInWorkspace(ctx.workspaceRoot, path);
    const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
      "@tauri-apps/plugin-fs"
    );
    const parent = parentOf(full);
    if (parent && !(await exists(parent, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    const tmp = `${full}.tmp`;
    await writeTextFile(tmp, content, { baseDir: BaseDirectory.AppData });
    await rename(tmp, full, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
    return { content: `write_file: ${path} · ${content.length} chars` };
  },
};

function parentOf(p: string): string {
  const slash = p.lastIndexOf("/");
  return slash === -1 ? "" : p.slice(0, slash);
}
