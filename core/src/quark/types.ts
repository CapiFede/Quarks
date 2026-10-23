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
 * Un space de la versión con Spaces (Personal, Trabajo…), tal como quedó en
 * disco. Se lo pasa el core a `Quark.migrateSpaces` en la migración única que
 * junta todo en una sola colección (ver `services/legacySpaces.ts`).
 */
export interface LegacySpace {
  id: string;
  name: string;
  /** Era el space activo en este dispositivo. Viene primero en la lista. */
  active: boolean;
  /** Secciones de `spaces/<id>.json`, por id de quark (sin validar). */
  sections: Record<string, unknown>;
}

/**
 * Contrato que implementa cada quark y se registra en el launcher.
 * Un quark depende del core; ningún quark depende de otro.
 *
 * Nombre e ícono NO van acá: viven en el stub del registry (`QUARK_STUBS`),
 * que es lo que pintan el Home y los tabs. El `id` tiene que coincidir.
 */
export interface Quark {
  id: string;

  buildPage(): ReactNode;
  buildToolbar?(): ReactNode;

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

  /**
   * Migración única desde los Spaces: arma la data única del quark juntando la
   * sección de cada space (`spaces[i].sections[quark.id]`). Corre en el
   * arranque, antes de montar nada, solo si hay data vieja. Debe FUSIONAR con
   * lo que ya haya en su destino (por id, lo existente gana) en vez de pisarlo:
   * puede volver a correr (se cortó a mitad, o una versión vieja de la app
   * volvió a crear spaces) y repetirla no tiene que perder ni duplicar nada.
   */
  migrateSpaces?(spaces: LegacySpace[]): Promise<void>;
}
