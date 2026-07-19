import { useSyncExternalStore } from "react";
import type { NotesStore } from "../store";
import type { NotesState } from "../types";

/** Suscribe un componente al store del quark y devuelve el snapshot completo. */
export function useNotesState(store: NotesStore): NotesState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
