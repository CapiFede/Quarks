/**
 * Dispatcher de tool execution. Recibe el `ToolCall` que vino del modelo,
 * matchea por nombre contra el `TOOLS` registry y ejecuta. Maneja:
 *
 *   - Tool inexistente / no permitida en el modo → result con error claro al
 *     modelo (no levanta excepción).
 *   - Args inválidos (JSON.parse falla) → result con error.
 *   - Excepciones durante execute → result con error + el message.
 *   - Truncación final: capamos el content a 16 KB para que el modelo no se
 *     atragante con archivos enormes que se le hayan escapado a la tool.
 *
 * El caller (`agentLoop`) decide qué hacer con el resultado (apendarlo y
 * seguir el loop, o cortar si pasamos `maxHops`).
 */
import type { ToolCall } from "../types";
import { isAllowedInMode } from "./policy";
import { getTool } from "./registry";
import type { ToolContext, ToolResult } from "./types";
import { PathSandboxError } from "./pathSandbox";

const MAX_RESULT = 16 * 1024;

export async function executeToolCall(
  call: ToolCall,
  ctx: ToolContext,
): Promise<ToolResult> {
  const tool = getTool(call.function.name);
  if (!tool) {
    return {
      content: `Tool \`${call.function.name}\` no existe.`,
      isError: true,
    };
  }
  if (!isAllowedInMode(tool, ctx.mode)) {
    return {
      content: `Tool \`${call.function.name}\` no está disponible en modo ${ctx.mode}.`,
      isError: true,
    };
  }

  let args: unknown;
  try {
    args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
  } catch (e) {
    return {
      content: `Args inválidos para \`${call.function.name}\`: ${(e as Error).message}`,
      isError: true,
    };
  }

  try {
    const result = await tool.execute(args, ctx);
    return {
      ...result,
      content: truncate(result.content),
    };
  } catch (e) {
    if (e instanceof PathSandboxError) {
      return { content: `${call.function.name}: ${e.message}`, isError: true };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return {
      content: `${call.function.name} falló: ${msg}`,
      isError: true,
    };
  }
}

function truncate(s: string): string {
  if (s.length <= MAX_RESULT) return s;
  return s.slice(0, MAX_RESULT) + `\n\n[…truncado a ${MAX_RESULT} chars]`;
}
