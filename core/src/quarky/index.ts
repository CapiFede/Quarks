/**
 * Superficie pública de Quarky: lo que el Shell y los quarks pueden consumir.
 *
 * Convención igual que `quark/index.ts`: este módulo es el límite. Nada de
 * importar archivos internos de `quarky/` por ruta relativa desde afuera. Los
 * quarks acceden vía `@quarks/core` (que re-exporta `useQuarky` y los tipos de
 * AiContext desde `quark/index.ts`).
 */

// ── Tipos del dominio ────────────────────────────────────────────────────────
export type {
  Conversation,
  ConversationSummary,
  Message,
  Mode,
  ModelInfo,
  QuarkyConfig,
  Role,
  ToolCall,
} from "./types";

// ── Provider / Context (UI integration) ──────────────────────────────────────
export { QuarkyProvider, useQuarky } from "./hooks/useQuarky";
export type { QuarkyContextValue } from "./hooks/useQuarky";
export { useQuarkyHotkeys } from "./hooks/useQuarkyHotkeys";
