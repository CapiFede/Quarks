import { useSyncExternalStore } from "react";
import type { BooksStore, BooksState } from "../store";

/** Suscribe un componente al store del quark y devuelve el snapshot completo. */
export function useBooksState(store: BooksStore): BooksState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
