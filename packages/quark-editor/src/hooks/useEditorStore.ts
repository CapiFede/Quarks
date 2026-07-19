import { useSyncExternalStore } from "react";
import type { EditorStore, EditorState } from "../store";

/** Suscribe un componente al snapshot del store del editor. */
export function useEditorState(store: EditorStore): EditorState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
