/**
 * Helpers puros del modelo Conversation: crear nuevas, agregar mensajes, generar
 * ids. La persistencia vive en `store.ts`; acá solo se manipula la forma del
 * objeto. Mantener funciones puras facilita ramificar estado en React sin tocar
 * disco hasta el commit.
 */
import type { Conversation, Message, Mode, TokenUsage, ToolCall } from "./types";

/** Id corto random (16 hex). `crypto.randomUUID()` también funciona; usamos esto por brevedad. */
function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Conversación vacía nueva, lista para persistir. `model` se hereda del último
 * usado (lo pasa el caller); `attachContext` arranca en `true` — si hay contexto
 * de quark (capítulo abierto), se inyecta hasta que el usuario lo apague.
 */
export function newConversation(spaceId: string, mode: Mode, model?: string): Conversation {
  const now = Date.now();
  return {
    id: randomId(),
    title: "Sin título",
    spaceId,
    mode,
    model,
    attachContext: true,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function makeUserMessage(content: string, images?: string[]): Message {
  return {
    id: randomId(),
    role: "user",
    content,
    images: images && images.length > 0 ? images : undefined,
    createdAt: Date.now(),
  };
}

export function makeAssistantMessage(
  content: string,
  toolCalls?: ToolCall[],
  usage?: TokenUsage,
): Message {
  return {
    id: randomId(),
    role: "assistant",
    content,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    createdAt: Date.now(),
  };
}

export function makeToolMessage(
  toolCallId: string,
  name: string,
  content: string,
): Message {
  return {
    id: randomId(),
    role: "tool",
    content,
    toolCallId,
    name,
    createdAt: Date.now(),
  };
}

/** Devuelve una copia de `conv` con `msg` apendado y `updatedAt` actualizado. */
export function appendMessage(conv: Conversation, msg: Message): Conversation {
  return {
    ...conv,
    messages: [...conv.messages, msg],
    updatedAt: Date.now(),
  };
}

/** Devuelve una copia con el título cambiado. */
export function rename(conv: Conversation, title: string): Conversation {
  return { ...conv, title, updatedAt: Date.now() };
}

/**
 * Devuelve una copia con el histórico vaciado pero conservando id/título/modelo/
 * toggle. Sirve para "limpiar chat" sin cerrar la tab (reusarla en blanco).
 */
export function clearMessages(conv: Conversation): Conversation {
  return { ...conv, messages: [], updatedAt: Date.now() };
}
