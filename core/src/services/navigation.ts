/**
 * Bus de navegación: un quark pide al Shell que traiga su propio tab al frente.
 *
 * Caso de uso: una alarma (o el fin de un timer) del quark Utilidades dispara
 * mientras el usuario está parado en otro quark (p. ej. Música). El store del
 * quark vive en otro paquete y no conoce al Shell, así que publica acá el id del
 * quark a enfocar; el Shell lo consume (abre/activa el tab) y limpia el bus.
 *
 * Mismo molde que `selection.ts` / `proposals.ts`: un store externo en módulo es
 * la forma más simple de cruzar la frontera quark↔core sin acoplar el quark al
 * Shell. La diferencia es que esto es un *comando* puntual (enfocá este tab), no
 * un estado a renderizar: el Shell lo consume una vez y lo limpia.
 */

let pending: string | null = null;
const listeners = new Set<() => void>();

/**
 * Pide enfocar el tab del quark `id` (lo abre si no estaba). Lo publica el quark
 * (vía `@quarks/core`); lo consume el Shell.
 */
export function requestOpenQuark(id: string): void {
  pending = id;
  for (const l of listeners) l();
}

/** Lectura síncrona del pedido pendiente (o null). La usa el Shell al notificar. */
export function getPendingQuark(): string | null {
  return pending;
}

/** El Shell limpia el pedido tras consumirlo (sin notificar, para no relanzar). */
export function clearPendingQuark(): void {
  pending = null;
}

/** Suscripción para el Shell. */
export function subscribeNavigation(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
