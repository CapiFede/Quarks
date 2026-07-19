/**
 * Registro central de tools. Importa cada builtin y las expone como tabla y
 * como array — la tabla la usa el dispatcher (`execution.ts`), el array lo usa
 * `policy.ts` para armar los schemas que van al modelo.
 *
 * Sumar una tool nueva = importarla acá y agregarla al `TOOLS` object. El
 * `name` del schema tiene que coincidir con la clave del object (el dispatcher
 * matchea por ese nombre).
 */
import type { ToolDef } from "./types";
import { readFile } from "./builtin/readFile";
import { listDir } from "./builtin/listDir";
import { glob } from "./builtin/glob";
import { grep } from "./builtin/grep";
import { webFetch } from "./builtin/webFetch";
import { manageMemory } from "./builtin/manageMemory";
import { writeFile } from "./builtin/writeFile";
import { editFile } from "./builtin/editFile";
import { proposeChapterRewrite } from "./builtin/proposeChapterRewrite";

export const TOOLS: Record<string, ToolDef> = {
  read_file: readFile,
  list_dir: listDir,
  glob,
  grep,
  web_fetch: webFetch,
  manage_memory: manageMemory,
  write_file: writeFile,
  edit_file: editFile,
  propose_chapter_rewrite: proposeChapterRewrite,
};

export function allTools(): ToolDef[] {
  return Object.values(TOOLS);
}

export function getTool(name: string): ToolDef | undefined {
  return TOOLS[name];
}
