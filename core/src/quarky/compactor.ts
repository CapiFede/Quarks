/**
 * Compactación automática del histórico cuando se acerca al límite de contexto.
 *
 * Cuándo: tras cada turno, si `(prompt + completion) > 0.85 * context_length`
 * del modelo activo (ver `provider.getModelContextLength`).
 *
 * Cómo:
 *  1. Encontramos un "corte limpio": el segundo user message más reciente. Todo
 *     lo anterior se resume; todo lo que sigue se conserva verbatim.
 *  2. El corte tiene que caer JUSTO antes de un `role:user` para no romper
 *     pares assistant/tool — la API se queja si un mensaje `tool` no tiene su
 *     `tool_calls` previo. La regla "siempre antes de un user" garantiza eso.
 *  3. Si no hay suficiente historia (≤2 user messages), no compactamos: el
 *     usuario tendrá que abrir conversación nueva si el contexto explotó.
 *  4. Llamamos al modelo para resumir; el resultado reemplaza al bloque
 *     anterior como UN solo mensaje del assistant, con prefijo `[COMPACTACIÓN]`.
 *
 * Patrón portado de `context_compactor.py` de odysseus, simplificado para
 * función-calling estructurado (no necesitamos sanitize de tool messages
 * huérfanos: el corte por boundary garantiza que no haya).
 */
import { chatCompletion } from "./provider";
import { makeAssistantMessage } from "./conversation";
import type { Conversation, Message } from "./types";

export const COMPACT_THRESHOLD = 0.85;
const SUMMARY_SYSTEM = `Vas a resumir un fragmento de conversación entre el usuario y un asistente IA.
Devolvé un resumen denso (3-6 párrafos cortos) que capture:
- qué pidió el usuario,
- qué se hizo (incluyendo archivos tocados, decisiones, datos extraídos),
- estado actual / qué quedó pendiente,
- preferencias del usuario y restricciones que aparecieron.
NO inventes detalles. Solo escribí el resumen, sin meta-comentarios.`;

/**
 * ¿Conviene compactar? `lastUsage` viene del último assistant message.
 */
export function shouldCompact(
  lastUsage: { promptTokens: number; completionTokens: number } | undefined,
  contextLength: number,
): boolean {
  if (!lastUsage) return false;
  const total = lastUsage.promptTokens + lastUsage.completionTokens;
  return total > contextLength * COMPACT_THRESHOLD;
}

/**
 * Compacta la conversación. Si no hay material suficiente, devuelve la misma
 * conversación intacta (el caller decide si avisa al usuario).
 */
export async function compactConversation(
  conv: Conversation,
  model: string,
): Promise<{ conversation: Conversation; compacted: boolean }> {
  const cutIndex = findCleanCut(conv.messages);
  if (cutIndex < 0) return { conversation: conv, compacted: false };

  const toSummarize = conv.messages.slice(0, cutIndex);
  const keep = conv.messages.slice(cutIndex);

  // Conversación sintética para el LLM: pasamos los mensajes a resumir como si
  // fueran el contenido a comprimir. Reutilizamos chatCompletion para no
  // duplicar la serialización del wire format.
  const stub: Conversation = {
    ...conv,
    messages: toSummarize,
  };
  let summary: string;
  try {
    const r = await chatCompletion({
      systemPrompt: SUMMARY_SYSTEM,
      conversation: stub,
      model,
    });
    summary = r.content.trim();
  } catch {
    return { conversation: conv, compacted: false };
  }
  if (!summary) return { conversation: conv, compacted: false };

  const compacted: Conversation = {
    ...conv,
    messages: [
      makeAssistantMessage(`[COMPACTACIÓN AUTOMÁTICA]\n\n${summary}`),
      ...keep,
    ],
    updatedAt: Date.now(),
  };
  return { conversation: compacted, compacted: true };
}

/**
 * Encuentra el índice de un corte limpio. La regla: queremos cortar justo antes
 * del SEGUNDO `role:user` empezando desde atrás (así dejamos los últimos dos
 * turnos verbatim como contexto cercano). Si no encontramos al menos dos user
 * messages, devolvemos -1 (no compactar).
 */
function findCleanCut(messages: Message[]): number {
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") userIndices.push(i);
  }
  if (userIndices.length < 3) return -1;
  // Penúltimo user: el corte va justo antes de él.
  return userIndices[userIndices.length - 2];
}
