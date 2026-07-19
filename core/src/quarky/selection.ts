/**
 * Bus global de selección de texto para Quarky.
 *
 * Cuando el usuario selecciona texto adentro de un quark editable (books, notes,
 * etc.), ese quark "publica" la selección acá. Quarky la consume en dos lugares:
 *
 *   1. UI: el panel muestra un badge ("X palabras seleccionadas en …") al lado
 *      del modelo, para que el usuario sepa que la IA va a ver ese texto.
 *   2. Prompt: `buildSystemPrompt` toma la selección actual y la inyecta como
 *      `UNTRUSTED_CONTEXT` ("El usuario se está refiriendo a este texto: …").
 *
 * Es un store externo super-chico (sin context). Quarky vive en un único árbol
 * React, pero los quarks viven en árboles distintos y no podemos pasarles un
 * setter por props sin contaminar todo el contrato. El bus en módulo es la
 * forma más simple de cruzar esa frontera sin acoplar.
 *
 * Publicar `null` borra la selección. El que publica es el responsable de
 * limpiar cuando el usuario deselecciona o pierde foco; Quarky no "adivina".
 */

export interface ActiveSelection {
  /** Id del quark que publicó (`"books"`, `"notes"`, …). Útil para diagnóstico. */
  source: string;
  /** Texto seleccionado, tal cual lo ve el usuario. */
  text: string;
  /** Etiqueta humana para el badge y para el prompt (ej: "Libro: Mi libro / Cap. 1"). */
  label?: string;
}

let current: ActiveSelection | null = null;
const listeners = new Set<() => void>();

/** Reemplaza la selección actual (o la borra si `next` es `null`). */
export function publishSelection(next: ActiveSelection | null): void {
  // Evitamos notificar si nada cambió — el dedupe corta loops cuando el
  // listener viene de un useEffect que reacciona al mismo cambio.
  if (sameSelection(current, next)) return;
  current = next;
  for (const l of listeners) l();
}

/** Lectura síncrona (la usa `buildSystemPrompt` al armar el turno). */
export function getActiveSelection(): ActiveSelection | null {
  return current;
}

/** Para `useSyncExternalStore`. */
export function subscribeSelection(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function sameSelection(a: ActiveSelection | null, b: ActiveSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.source === b.source && a.text === b.text && a.label === b.label;
}
