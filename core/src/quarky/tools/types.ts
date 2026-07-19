/**
 * Tipos del subsistema de tools de Quarky.
 *
 * Formato de schemas = OpenAI function-calling (es lo que OpenRouter espera
 * en `tools[]` de `/chat/completions`). El resultado de cada ejecución vuelve al
 * modelo como un `role: "tool"` message con el contenido formateado.
 */
import type { Mode } from "../types";

/** Schema en el wire format que va al modelo. */
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

/**
 * Contexto pasado a cada `execute()`. Lleva el workspace root, el modo activo
 * y un signal para cancelar mid-ejecución (M2 streaming/abort).
 */
export interface ToolContext {
  /** Ruta relativa a AppData (p. ej. "packages") que actúa como jaula. */
  workspaceRoot: string;
  mode: Mode;
  signal?: AbortSignal;
}

/** Resultado de una tool execution. */
export interface ToolResult {
  /** Texto que el modelo va a ver como respuesta de la tool. */
  content: string;
  /** Si true, la UI lo pinta como error (el modelo igual lo recibe). */
  isError?: boolean;
}

/** Definición completa de una tool: schema + handler + política. */
export interface ToolDef {
  schema: ToolSchema;
  /** Disponible en modo Ask (read-only). Default: false. */
  availableInAsk?: boolean;
  /** Requiere aprobación del usuario antes de ejecutar (solo en Agent). */
  requiresApproval?: boolean;
  execute(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

/** Lo que la UI necesita mostrar al pedir aprobación. */
export interface ApprovalRequest {
  toolCallId: string;
  name: string;
  args: unknown;
}

/** Decisión del usuario sobre un `ApprovalRequest`. */
export type ApprovalDecision =
  | { kind: "approve" }
  | { kind: "reject"; reason?: string }
  | { kind: "feedback"; message: string };
