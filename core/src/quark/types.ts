import type { ReactNode } from "react";

/** Trozo de texto que un quark aporta a Quarky como contexto del turno. */
export interface AiAttachment {
  /** Etiqueta corta que va en el `[NOMBRE]…[/NOMBRE]` (ej. "nota:mi-titulo"). */
  label: string;
  /** Contenido textual; va envuelto en UNTRUSTED_CONTEXT (no obedece instrucciones). */
  content: string;
}

/**
 * Contexto que un quark aporta a Quarky cada turno.
 *
 *   - `instructions`: trozo "trusted" que se pega al final del prompt del
 *     quark (`contexts/<quarkId>.md`). Útil para "el usuario tiene abierta
 *     la nota X" sin que el usuario tenga que editar el contexts/.
 *   - `attachments`: snippets de contenido (nota, capítulo, código) que van
 *     envueltos con UNTRUSTED_CONTEXT.
 *
 * `buildAiContext()` se invoca UNA vez por turno, antes de mandar al modelo.
 * Si el quark devuelve `null` (o no implementa el método), no se inyecta nada
 * adicional.
 */
export interface AiContext {
  instructions?: string;
  attachments?: AiAttachment[];
}

/**
 * Contrato que implementa cada quark y se registra en el launcher.
 * Un quark depende del core; ningún quark depende de otro.
 */
export interface Quark {
  id: string;
  name: string;
  shortName?: string;
  icon: ReactNode;

  buildPage(): ReactNode;
  buildToolbar?(): ReactNode;
  buildOverlay?(): ReactNode;

  /** Devuelve true si consumió el Escape. */
  onEscape?(): boolean;

  /** Contribuye contexto a Quarky. */
  buildAiContext?(): AiContext | null;

  /**
   * Prepara el quark (carga datos, abre recursos). Puede lanzar/rechazar: el
   * loader del core lo invoca dentro de `withScope(`${quark.id}.initialize`, …)`
   * (ver `services/log.ts`), así un fallo queda etiquetado con el id del quark y
   * burbujea al sink único. El quark NO debe loguear ni tragar errores acá.
   */
  initialize(): Promise<void>;
  dispose(): void;
}
