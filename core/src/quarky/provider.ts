/**
 * Cliente HTTP del provider de Quarky.
 *
 * Único provider en M1: **OpenRouter** (`https://openrouter.ai/api/v1`). Es
 * OpenAI-compatible, así que reusamos el mismo wire format (chat completions con
 * `messages[]`, `tool_calls`, `tool_call_id`).
 *
 * Usa `@tauri-apps/plugin-http` por el mismo motivo que `googleDrive.ts`: el
 * fetch del WebView dispara CORS contra openrouter.ai. La importación es lazy
 * para no inflar el bundle cuando Quarky no se usa.
 *
 * M1: chat completion **no-streaming**. El streaming llega en M2 (mismo endpoint,
 * `stream: true` + SSE parser aparte).
 */
import { getSecret } from "../services/secrets";
import type { Conversation, Message, ModelInfo, TokenUsage, ToolCall } from "./types";
import type { ToolSchema } from "./tools/types";

const BASE_URL = "https://openrouter.ai/api/v1";
/** Header opcional pero recomendado por OpenRouter para rankings públicos. */
const APP_REFERER = "https://quarks.app";
const APP_TITLE = "Quarks";

/** Clave del keyring donde vive la API key (ver `services/secrets.ts`). */
export const OPENROUTER_KEY = "quarky.openrouter.apiKey";

export class QuarkyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuarkyConfigError";
  }
}

/** `fetch` del plugin HTTP de Tauri; en navegador (modo dev fuera de Tauri) cae al global. */
async function http() {
  try {
    const mod = await import("@tauri-apps/plugin-http");
    return mod.fetch;
  } catch {
    return globalThis.fetch;
  }
}

/** Encabezados comunes de OpenRouter. Lanza si falta la API key. */
async function authHeaders(): Promise<Record<string, string>> {
  const apiKey = await getSecret(OPENROUTER_KEY);
  if (!apiKey) {
    throw new QuarkyConfigError(
      "Falta la API key de OpenRouter. Configurala en Settings → Quarky.",
    );
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": APP_REFERER,
    "X-Title": APP_TITLE,
    "Content-Type": "application/json",
  };
}

// ── Wire format ──────────────────────────────────────────────────────────────

/**
 * Part de contenido multimodal (formato OpenAI). Un mensaje de usuario con
 * imágenes manda `content` como array de parts en vez de un string plano.
 */
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Mensaje en el wire format de OpenAI/OpenRouter. */
interface ApiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * Convierte una conversación + system prompt en la lista que va al wire. Filtra
 * mensajes vacíos para `user`, deja `assistant` vacíos si traen `toolCalls`, y
 * mapea los campos camelCase ↔ snake_case que la API espera.
 *
 * Mensajes de usuario con imágenes: el `content` pasa a ser un array de parts
 * (`text` + un `image_url` por imagen). Requiere un modelo con visión.
 */
export function toApiMessages(systemPrompt: string, conv: Conversation): ApiMessage[] {
  const out: ApiMessage[] = [];
  if (systemPrompt.trim()) out.push({ role: "system", content: systemPrompt });
  for (const m of conv.messages) {
    if (m.role === "user") {
      const hasImages = m.images && m.images.length > 0;
      if (!m.content && !hasImages) continue;
      if (hasImages) {
        const parts: ContentPart[] = [];
        if (m.content) parts.push({ type: "text", text: m.content });
        for (const url of m.images!) parts.push({ type: "image_url", image_url: { url } });
        out.push({ role: "user", content: parts });
      } else {
        out.push({ role: "user", content: m.content });
      }
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls,
      });
    } else if (m.role === "tool") {
      out.push({
        role: "tool",
        content: m.content,
        tool_call_id: m.toolCallId,
        name: m.name,
      });
    }
  }
  return out;
}

// ── Catálogo de modelos ──────────────────────────────────────────────────────

interface ModelsResponse {
  data?: Array<{
    id: string;
    name?: string;
    context_length?: number;
    pricing?: { prompt?: string; completion?: string };
  }>;
}

/**
 * Cache en memoria de la última respuesta de `/models`. Lo usamos para resolver
 * `context_length` por modelo sin hacer un round-trip extra antes de cada turno.
 * Vida del cache: el lifetime del proceso (no es crítico que esté siempre fresco
 * — los context windows no cambian día a día).
 */
let _modelsCache: ModelInfo[] | null = null;

/**
 * Lista los modelos disponibles en OpenRouter. No requiere API key (el endpoint
 * es público) pero la mandamos si está para que pricing/limits salgan según la
 * cuenta. Filtra y ordena por nombre para el picker.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const fetch = await http();
  const headers: Record<string, string> = {
    "HTTP-Referer": APP_REFERER,
    "X-Title": APP_TITLE,
  };
  const apiKey = await getSecret(OPENROUTER_KEY);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE_URL}/models`, { method: "GET", headers });
  if (!res.ok) {
    throw new Error(`OpenRouter /models ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as ModelsResponse;
  const models = (json.data ?? []).map<ModelInfo>((m) => ({
    id: m.id,
    name: m.name,
    contextLength: m.context_length,
    promptPrice: m.pricing?.prompt ? Number(m.pricing.prompt) : undefined,
    completionPrice: m.pricing?.completion ? Number(m.pricing.completion) : undefined,
  }));
  models.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
  _modelsCache = models;
  return models;
}

/**
 * Devuelve el `context_length` del modelo, en tokens. Usa el cache si lo tiene;
 * si no, fetcha y cachea. Fallback a 32_000 cuando OpenRouter no informa (modelo
 * desconocido o `/models` falló) — es conservador: vamos a compactar antes.
 */
export async function getModelContextLength(modelId: string): Promise<number> {
  if (!_modelsCache) {
    try {
      await listModels();
    } catch {
      return 32_000;
    }
  }
  const m = _modelsCache?.find((x) => x.id === modelId);
  return m?.contextLength ?? 32_000;
}

// ── Chat completion (no-streaming, M1) ───────────────────────────────────────

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ChatCompletionOptions {
  systemPrompt: string;
  conversation: Conversation;
  model: string;
  /** Schemas a ofrecer al modelo en este turno. Vacío = sin tools. */
  tools?: ToolSchema[];
  /** Para cancelar la request en curso. */
  signal?: AbortSignal;
}

/**
 * Pide una respuesta no-streaming al modelo. Devuelve el mensaje del assistant
 * listo para apendar al histórico (todavía sin `id` propio: lo asigna el caller
 * con `makeAssistantMessage`).
 */
export async function chatCompletion(
  opts: ChatCompletionOptions,
): Promise<{
  content: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: TokenUsage;
}> {
  const fetch = await http();
  const headers = await authHeaders();
  const body = JSON.stringify({
    model: opts.model,
    messages: toApiMessages(opts.systemPrompt, opts.conversation),
    stream: false,
    ...(opts.tools && opts.tools.length > 0 ? { tools: opts.tools } : null),
  });
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body,
    signal: opts.signal,
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /chat/completions ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as ChatCompletionResponse;
  const choice = json.choices?.[0];
  if (!choice?.message) throw new Error("OpenRouter: respuesta sin choices.");
  const usage = json.usage
    ? {
        promptTokens: json.usage.prompt_tokens ?? 0,
        completionTokens: json.usage.completion_tokens ?? 0,
      }
    : undefined;
  return {
    content: choice.message.content ?? "",
    toolCalls: choice.message.tool_calls,
    finishReason: choice.finish_reason,
    usage,
  };
}

/** Helper para llamar y devolver directamente el `Message` apendable al histórico. */
export async function completeAsMessage(opts: ChatCompletionOptions): Promise<{
  message: Pick<Message, "role" | "content" | "toolCalls" | "usage">;
  finishReason?: string;
}> {
  const r = await chatCompletion(opts);
  return {
    message: {
      role: "assistant",
      content: r.content,
      toolCalls: r.toolCalls,
      usage: r.usage,
    },
    finishReason: r.finishReason,
  };
}
