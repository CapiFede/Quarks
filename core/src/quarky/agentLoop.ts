/**
 * Loop multi-hop con tool calls.
 *
 * Para cada turno del usuario:
 *   1. Calculamos los schemas que vamos a ofrecer al modelo (según el mode).
 *   2. Pedimos completion al provider.
 *   3. Si `tool_calls` viene vacío → terminó el turno: persistimos el último
 *      assistant message y salimos.
 *   4. Si hay tool calls → por cada uno:
 *      - Si la tool requiere aprobación (Agent + writeFile/editFile),
 *        pausamos esperando el veredicto del usuario.
 *      - Si rechaza, devolvemos al modelo un `tool_result` con error y le
 *        damos otro hop para que reaccione.
 *      - Si da feedback, lo apendamos como user message y rompemos el loop —
 *        el agente arranca de nuevo con la nueva guía.
 *      - Si aprueba (o no requiere aprobación), ejecutamos y apendamos el
 *        `tool_result`.
 *   5. Vuelta al paso 2, hasta `maxHops`.
 *
 * Eventos: `onUpdate(conv)` se invoca después de CADA mutación de la
 * conversación, para que la UI vea el progreso (mensajes del assistant,
 * resultados de tools) sin esperar al final del loop.
 */
import type {
  Conversation,
  Message,
  Mode,
  ToolCall,
} from "./types";
import {
  appendMessage,
  makeAssistantMessage,
  makeToolMessage,
  makeUserMessage,
} from "./conversation";
import { completeAsMessage } from "./provider";
import { executeToolCall } from "./tools/execution";
import { schemasForMode, needsApproval } from "./tools/policy";
import { getTool, allTools } from "./tools/registry";
import type { ApprovalDecision, ApprovalRequest } from "./tools/types";

export interface AgentLoopOptions {
  systemPrompt: string;
  conversation: Conversation;
  model: string;
  mode: Mode;
  maxHops: number;
  workspaceRoot: string;
  signal?: AbortSignal;
  /** Callback con la conversación actualizada en cada paso (live UI). */
  onUpdate: (conv: Conversation) => void;
  /**
   * Cómo pedirle al usuario que apruebe una tool. La UI resuelve la promise
   * con la decisión. Si no se provee, las tools mutantes se RECHAZAN
   * automáticamente (fail-closed).
   */
  requestApproval?: (req: ApprovalRequest) => Promise<ApprovalDecision>;
}

export interface AgentLoopResult {
  conversation: Conversation;
  /** True si paramos por `maxHops`; false si terminó normal. */
  hitHopLimit: boolean;
}

export async function runAgentLoop(opts: AgentLoopOptions): Promise<AgentLoopResult> {
  let conv = opts.conversation;
  const tools = schemasForMode(opts.mode, allTools());

  for (let hop = 0; hop < opts.maxHops; hop++) {
    if (opts.signal?.aborted) break;

    const result = await completeAsMessage({
      systemPrompt: opts.systemPrompt,
      conversation: conv,
      model: opts.model,
      tools,
      signal: opts.signal,
    });

    // Apendamos el assistant message (puede traer content + tool_calls).
    const assistant = makeAssistantMessage(
      result.message.content,
      result.message.toolCalls,
      result.message.usage,
    );
    conv = appendMessage(conv, assistant);
    opts.onUpdate(conv);

    const calls = result.message.toolCalls ?? [];
    if (calls.length === 0) {
      return { conversation: conv, hitHopLimit: false };
    }

    // Ejecutamos cada tool_call en orden (no en paralelo a propósito: queremos
    // un audit log claro para el usuario; la mayoría de los modelos pide pocas).
    let shouldBreakForFeedback = false;
    for (const call of calls) {
      if (opts.signal?.aborted) break;

      const tool = getTool(call.function.name);
      // Política de aprobación: si la tool la requiere en este modo y no hay
      // callback de aprobación, fail-closed (rechaza solo).
      if (tool && needsApproval(tool, opts.mode)) {
        const decision: ApprovalDecision = opts.requestApproval
          ? await opts.requestApproval({
              toolCallId: call.id,
              name: call.function.name,
              args: safeParseArgs(call.function.arguments),
            })
          : { kind: "reject", reason: "No hay callback de aprobación." };

        if (decision.kind === "reject") {
          conv = appendMessage(
            conv,
            makeToolMessage(
              call.id,
              call.function.name,
              `Usuario rechazó la ejecución${decision.reason ? `: ${decision.reason}` : "."}`,
            ),
          );
          opts.onUpdate(conv);
          continue;
        }

        if (decision.kind === "feedback") {
          // Apendamos un tool_result "stub" para no dejar tool_calls huérfanos
          // (la API se queja), seguido del feedback del usuario como nuevo
          // mensaje user. Rompemos el loop por hops; el siguiente turno
          // arranca con esa guía en la cola.
          conv = appendMessage(
            conv,
            makeToolMessage(
              call.id,
              call.function.name,
              `Usuario pidió cambiar de rumbo (ver siguiente mensaje).`,
            ),
          );
          conv = appendMessage(conv, makeUserMessage(decision.message));
          opts.onUpdate(conv);
          shouldBreakForFeedback = false; // dejamos que el loop siga (nuevo hop)
          break;
        }
        // approve → seguimos a ejecutar abajo.
      }

      const toolResult = await executeToolCall(call, {
        workspaceRoot: opts.workspaceRoot,
        mode: opts.mode,
        signal: opts.signal,
      });
      conv = appendMessage(
        conv,
        makeToolMessage(call.id, call.function.name, toolResult.content),
      );
      opts.onUpdate(conv);
    }

    if (shouldBreakForFeedback) break;
  }

  // Si llegamos acá es porque agotamos hops o el signal abortó.
  return { conversation: conv, hitHopLimit: !opts.signal?.aborted };
}

function safeParseArgs(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

/** Tipo helper para los consumidores que quieren saber si una mensaje es un tool_call vacío. */
export function hasToolCalls(m: Message): boolean {
  return m.role === "assistant" && !!m.toolCalls && m.toolCalls.length > 0;
}

/** Helper para detectar el último tool_call sin tool_result asociado (M2 streaming). */
export function pendingToolCallId(conv: Conversation): string | null {
  const ids = new Set<string>();
  for (const m of conv.messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const c of m.toolCalls) ids.add(c.id);
    } else if (m.role === "tool" && m.toolCallId) {
      ids.delete(m.toolCallId);
    }
  }
  const last = [...ids].pop();
  return last ?? null;
}

// Re-export del tipo `ToolCall` para que el caller no tenga que importar de types directo.
export type { ToolCall };
