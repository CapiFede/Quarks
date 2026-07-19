/**
 * Bus global de propuestas IA para el quark Libros.
 *
 * Cuando Quarky llama a la tool `propose_chapter_rewrite`, el resultado no se
 * escribe a disco: se publica acá y el books quark abre una vista comparativa
 * (capítulo actual a la izquierda, propuesta a la derecha). El usuario decide
 * con tres botones (rechazar / reemplazar / aceptar como nuevo capítulo).
 *
 * Es un store externo, mismo molde que `selection.ts`: la tool vive en el core
 * y el quark vive en otro paquete; un bus en módulo es la forma más simple de
 * cruzar esa frontera sin acoplar tools al store del quark.
 *
 * Solo el books quark "consume" la propuesta (la copia a su estado interno y
 * limpia el bus). Si nadie lo consume en N segundos, queda colgada hasta que
 * alguien publique `null`.
 */

export interface BookProposal {
  /** Texto markdown completo del capítulo reescrito. */
  content: string;
  /** Resumen corto del modelo (1-2 oraciones). Opcional. */
  summary?: string | null;
  /** Título sugerido para el capítulo nuevo si el usuario elige "Aceptar". */
  suggestedTitle?: string | null;
}

let current: BookProposal | null = null;
const listeners = new Set<() => void>();

/** Publica una propuesta nueva (o limpia con `null`). */
export function publishBookProposal(next: BookProposal | null): void {
  current = next;
  for (const l of listeners) l();
}

/** Lectura síncrona. La usa el books store al recibir la notificación. */
export function getBookProposal(): BookProposal | null {
  return current;
}

/** Suscripción para `useSyncExternalStore` o listeners manuales. */
export function subscribeBookProposal(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
