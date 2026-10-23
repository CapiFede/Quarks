/**
 * `glob`: busca archivos por pattern dentro del workspace.
 *
 * Soporta un subset chico de glob — suficiente para "todos los .json de music"
 * o "todos los .md en cualquier carpeta":
 *
 *   *    matchea cualquier secuencia SIN slashes
 *   **   matchea cualquier secuencia INCLUYENDO slashes
 *   ?    matchea un solo char no-slash
 *
 * Devuelve hasta 200 rutas relativas al workspace, ordenadas alfabéticamente.
 *
 * Impl: compilamos el pattern a RegExp y caminamos el árbol con readDir
 * recursivo desde la raíz del workspace.
 */
import { resolveInWorkspace, relToWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";
import { walkFiles } from "../../../services/store";

const MAX_HITS = 200;

interface Args {
  pattern: string;
  path?: string;
}

export const glob: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "glob",
      description:
        "Encuentra archivos por pattern (* / ** / ?) dentro del workspace. Devuelve hasta 200 rutas. Ejemplo: `**/*.json` lista todos los JSON del workspace.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Pattern. Ej: `*.md`, `**/*.json`, `music/**/*.mp3`" },
          path: { type: "string", description: "Subcarpeta donde buscar; vacío = raíz del workspace." },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { pattern, path = "" } = rawArgs as Args;
    const re = compileGlob(pattern);
    const root = resolveInWorkspace(ctx.workspaceRoot, path);
    const { BaseDirectory, exists } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(root, { baseDir: BaseDirectory.AppData }))) {
      return { content: `glob: no existe \`${path || "."}\``, isError: true };
    }

    // El pattern matchea contra la ruta relativa al workspace (p. ej.
    // `music/**/*.mp3`), que es como la ve el modelo.
    const hits: string[] = [];
    for await (const rel of walkFiles(root)) {
      const display = relToWorkspace(ctx.workspaceRoot, rel);
      if (re.test(display)) hits.push(display);
      if (hits.length >= MAX_HITS) break;
    }

    if (hits.length === 0) return { content: `glob: sin matches para \`${pattern}\`` };
    hits.sort();
    const truncated = hits.length >= MAX_HITS;
    const header = `# \`${pattern}\` · ${hits.length}${truncated ? "+" : ""} archivo${hits.length === 1 ? "" : "s"}\n`;
    return { content: header + hits.join("\n") };
  },
};

/**
 * Compila un pattern minimal-glob a RegExp. Maneja meta-chars de regex
 * escapándolos (`.`, `+`, etc.) y traduce `*`/`**`/`?` a sus equivalentes.
 */
function compileGlob(pattern: string): RegExp {
  let r = "^";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        // `**/` = cualquier subpath incluyendo nada
        r += "(?:.*?/)?";
        i += 2;
        if (pattern[i] === "/") i++;
      } else {
        r += "[^/]*";
        i++;
      }
    } else if (ch === "?") {
      r += "[^/]";
      i++;
    } else if (".+^$|(){}[]\\".includes(ch)) {
      r += "\\" + ch;
      i++;
    } else {
      r += ch;
      i++;
    }
  }
  r += "$";
  return new RegExp(r);
}
