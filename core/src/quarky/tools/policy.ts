/**
 * Política estática por tool: en qué modo se ofrece al modelo, si requiere
 * aprobación. Es deliberadamente simple — una tabla, no un sistema dinámico.
 *
 * Reglas:
 *   - Modo **Ask**: solo tools read-only (las marcadas `availableInAsk: true`
 *     en su `ToolDef`). El modelo NO ve las demás.
 *   - Modo **Agent**: todas las tools. Las mutantes piden aprobación inline
 *     antes de ejecutar.
 *
 * Cuando agreguemos tools nuevas, las dos columnas que importan están en el
 * `ToolDef` (`availableInAsk`, `requiresApproval`) — este archivo es solo el
 * resolvedor que las consulta.
 */
import type { Mode } from "../types";
import type { ToolDef, ToolSchema } from "./types";

/** Schemas que se mandan al modelo en este modo. */
export function schemasForMode(mode: Mode, tools: ToolDef[]): ToolSchema[] {
  if (mode === "ask") return tools.filter((t) => t.availableInAsk).map((t) => t.schema);
  return tools.map((t) => t.schema);
}

/** ¿La tool puede ejecutarse en este modo? */
export function isAllowedInMode(tool: ToolDef, mode: Mode): boolean {
  if (mode === "ask") return !!tool.availableInAsk;
  return true;
}

/** ¿La tool pide aprobación al usuario antes de correr? Solo aplica en Agent. */
export function needsApproval(tool: ToolDef, mode: Mode): boolean {
  if (mode === "ask") return false; // en Ask las mutantes no se ofrecen
  return !!tool.requiresApproval;
}
