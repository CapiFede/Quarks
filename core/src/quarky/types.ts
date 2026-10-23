/**
 * Tipos del dominio Quarky (asistente IA del core).
 *
 * Formato de mensajes y tool calls = formato OpenAI chat completions. OpenRouter
 * es OpenAI-compatible al 100 %, así que reusamos el mismo shape para no traducir
 * en el wire. Cada conversación vive en `quarky/chats/<id>.json`. Ver
 * `.claude/knowledge/StorageLayout.md`.
 */

/** Roles del wire format OpenAI. `tool` carga el resultado de una tool_call previa. */
export type Role = "system" | "user" | "assistant" | "tool";

/** Modo de la conversación. Ask: solo tools read-only. Agent: todas (mutantes piden aprobación). */
export type Mode = "ask" | "agent";

/**
 * Tool call del modelo en formato OpenAI. `arguments` viene siempre como string
 * JSON (lo parsea el dispatcher de tools antes de ejecutar).
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * Conteo de tokens reportado por el provider. OpenRouter manda esto en `usage`
 * con cada response de `/chat/completions`. Lo guardamos por mensaje del
 * assistant para poder sumar totales a nivel conversación en la UI.
 */
export interface TokenUsage {
  /** Tokens del input (system + historia hasta este turno). */
  promptTokens: number;
  /** Tokens generados por el assistant en este mensaje. */
  completionTokens: number;
}

/**
 * Mensaje del histórico. Para role:assistant `content` puede ser "" si el modelo
 * solo devolvió `toolCalls`. Para role:tool, `toolCallId` referencia al tool_call
 * que se está respondiendo y `name` es el nombre de la tool (requerido por la API).
 */
export interface Message {
  /** Id local; no se manda al modelo. */
  id: string;
  role: Role;
  content: string;
  /**
   * Imágenes adjuntas por el usuario, como data URLs base64
   * (`data:image/png;base64,…`). Solo en role:user. Se mandan al modelo como
   * parts `image_url` (requiere un modelo con visión). Se persisten inline en el
   * JSON de la conversación.
   */
  images?: string[];
  /** Solo en role:assistant cuando el modelo invoca tools. */
  toolCalls?: ToolCall[];
  /** Solo en role:tool. */
  toolCallId?: string;
  /** Solo en role:tool: nombre de la tool que se ejecutó. */
  name?: string;
  /** Solo en role:tool: la tool falló o no se ejecutó. Para la UI; no se manda al modelo. */
  isError?: boolean;
  /** Solo en role:assistant si el provider reportó usage en la respuesta. */
  usage?: TokenUsage;
  /** Epoch ms; útil para UI y ordenamiento, no se manda al modelo. */
  createdAt: number;
}

/** Conversación: encabezado + histórico. Se persiste íntegra cada vez que cambia. */
export interface Conversation {
  id: string;
  /** Título corto para la lista; auto-renombrado tras la primera respuesta. */
  title: string;
  /** Modo activo. Default viene de QuarkyConfig.modeDefault al crearse. */
  mode: Mode;
  /**
   * Modelo de OpenRouter de ESTA conversación. Opcional para no romper
   * conversaciones viejas: si falta, se cae a `QuarkyConfig.model`. Al crear una
   * tab nueva se hereda el último usado; al cambiarlo desde el panel se escribe
   * acá (y se recuerda en config como default para la próxima tab).
   */
  model?: string;
  /**
   * Si la conversación inyecta el contexto del quark activo (p. ej. el capítulo
   * abierto de Libros). Opcional: `undefined` se trata como `true`
   * (retrocompatible). Toggle por chat — no todas las conversaciones necesitan
   * ese contexto.
   */
  attachContext?: boolean;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

/** Resumen liviano para la lista de conversaciones (sin cargar `messages`). */
export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
}

/**
 * Configuración persistida de Quarky en `quarky/config.json`. La API key NO va
 * acá: vive en el keyring del SO (clave `quarky.openrouter.apiKey`).
 */
export interface QuarkyConfig {
  /** Modelo de OpenRouter activo (p. ej. "anthropic/claude-haiku", "openai/gpt-4o-mini"). */
  model: string;
  /**
   * Ids de modelos marcados como favoritos. Aparecen en el dropdown rápido del
   * panel para cambiar de modelo sin abrir Settings. Orden = orden de marcado.
   */
  favoriteModels: string[];
  /**
   * Raíz que ven las tools de filesystem. Default: `<AppData>/com.quarks.app/packages/`
   * (solo data de quarks). `undefined` = usar el default.
   */
  workspaceRoot?: string;
  /** Tope de hops en el agent loop. */
  maxHops: number;
  /** Modo con el que arrancan las conversaciones nuevas. */
  modeDefault: Mode;
  /** Auto-rename de conversaciones tras el primer turno. Default true. */
  autoRename: boolean;
  /**
   * Retrieval semántico (RAG) sobre la memoria. Si está en `false`, en cada
   * turno se inyectan TODAS las entradas (modo legacy). Si está en `true`, se
   * inyectan solo las `pinned` + top-K por similitud vectorial al mensaje del
   * usuario. Requiere descargar el modelo de embeddings (~33MB) en primer uso.
   */
  ragEnabled: boolean;
  /**
   * Si está en `true`, después de cada respuesta del asistente se dispara un
   * extractor en background que mira los últimos mensajes y decide si guardar
   * hechos durables en memoria. Combinable con regex fallback (que captura
   * patrones obvios sin llamar al modelo).
   */
  autoExtractMemory: boolean;
  /**
   * Modelo de OpenRouter usado para la auto-extracción de memoria.
   * Debe ser barato/gratis — los `:free` de OpenRouter funcionan bien para esta
   * tarea (extraer JSON desde diálogo es liviano). El modelo principal de chat
   * (`model`) es independiente de este.
   */
  extractorModel: string;
}

export const DEFAULT_CONFIG: QuarkyConfig = {
  model: "anthropic/claude-haiku-4-5",
  favoriteModels: [],
  workspaceRoot: undefined,
  maxHops: 8,
  modeDefault: "ask",
  autoRename: true,
  // Opt-in: si está apagado, no se carga el modelo de embeddings y se inyecta
  // toda la memoria en cada turno.
  ragEnabled: false,
  // Opt-in también. Cuando se active, requiere `extractorModel` configurado.
  autoExtractMemory: false,
  extractorModel: "google/gemma-3-27b-it:free",
};

/** Metadata de un modelo del catálogo de OpenRouter (subset de campos que usamos). */
export interface ModelInfo {
  id: string;
  name?: string;
  contextLength?: number;
  /** USD por 1k tokens. Útil para mostrar precio en el picker. */
  promptPrice?: number;
  completionPrice?: number;
}
