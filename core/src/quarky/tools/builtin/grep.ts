/**
 * `grep`: busca un patrón regex en los archivos de texto del workspace.
 *
 * Implementación TS pura (sin invocar ripgrep): camina el árbol con `readDir`
 * recursivo y matchea con `RegExp`. Suficiente para directorios chicos como los
 * de Quarks; si crece, podemos delegar a una crate Rust en src-tauri.
 *
 * Limites: 50 archivos matcheados, 5 matches por archivo (típico ripgrep).
 */
import { resolveInWorkspace, relToWorkspace } from "../pathSandbox";
import type { ToolDef } from "../types";
import { walkFiles } from "../../../services/store";

const MAX_FILES = 50;
const MAX_PER_FILE = 5;
const SKIP_EXTS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf",
  "mp3", "mp4", "wav", "flac", "ogg", "m4a",
  "zip", "tar", "gz", "exe", "dll", "so", "bin",
]);

interface Args {
  pattern: string;
  path?: string;
  caseInsensitive?: boolean;
}

export const grep: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "grep",
      description:
        "Busca un patrón (regex) en el contenido de archivos de texto del workspace. Devuelve hasta 50 archivos con sus matches (línea + número). Salta archivos binarios.",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex a buscar." },
          path: { type: "string", description: "Subcarpeta del workspace; vacío = raíz." },
          caseInsensitive: { type: "boolean", description: "Default true." },
        },
        required: ["pattern"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const args = rawArgs as Args;
    const flags = args.caseInsensitive === false ? "" : "i";
    let re: RegExp;
    try {
      re = new RegExp(args.pattern, flags);
    } catch (e) {
      return { content: `grep: regex inválido (${(e as Error).message})`, isError: true };
    }
    const root = resolveInWorkspace(ctx.workspaceRoot, args.path ?? "");
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(root, { baseDir: BaseDirectory.AppData }))) {
      return { content: `grep: no existe \`${args.path ?? "."}\``, isError: true };
    }

    const hits: string[] = [];
    let filesHit = 0;

    for await (const rel of walkFiles(root)) {
      if (filesHit >= MAX_FILES) break;
      if (shouldSkip(rel)) continue;
      let text: string;
      try {
        text = await readTextFile(rel, { baseDir: BaseDirectory.AppData });
      } catch {
        continue; // binarios crashean readTextFile; los saltamos.
      }
      const matches = matchLines(text, re);
      if (matches.length === 0) continue;
      filesHit++;
      hits.push(`## ${relToWorkspace(ctx.workspaceRoot, rel)}`);
      for (const m of matches.slice(0, MAX_PER_FILE)) {
        hits.push(`${m.lineNum}: ${m.text}`);
      }
      if (matches.length > MAX_PER_FILE) {
        hits.push(`… +${matches.length - MAX_PER_FILE} matches`);
      }
      hits.push("");
    }
    if (hits.length === 0) {
      return { content: `grep: sin matches para /${args.pattern}/${flags}` };
    }
    const truncated = filesHit >= MAX_FILES;
    const header = `# /${args.pattern}/${flags} · ${filesHit}${truncated ? "+" : ""} archivos\n\n`;
    return { content: header + hits.join("\n") };
  },
};

function shouldSkip(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return SKIP_EXTS.has(name.slice(dot + 1).toLowerCase());
}

function matchLines(text: string, re: RegExp): { lineNum: number; text: string }[] {
  const out: { lineNum: number; text: string }[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      out.push({ lineNum: i + 1, text: lines[i].slice(0, 200) });
    }
  }
  return out;
}
