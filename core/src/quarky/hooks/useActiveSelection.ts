/**
 * Hook React para leer el bus de selección (ver `selection.ts`).
 *
 * Lo usa el panel de Quarky para mostrar el badge "X palabras seleccionadas".
 * Como el store es global y mutable, usamos `useSyncExternalStore` para que
 * React lo trate como una fuente externa segura (sin re-renders perdidos).
 */
import { useSyncExternalStore } from "react";
import {
  getActiveSelection,
  subscribeSelection,
  type ActiveSelection,
} from "../selection";

export function useActiveSelection(): ActiveSelection | null {
  return useSyncExternalStore(subscribeSelection, getActiveSelection, getActiveSelection);
}
