import { useSyncExternalStore } from "react";
import type { ExternalStore } from "../../services/externalStore";

/** Suscribe un componente a un `ExternalStore` y devuelve el snapshot completo. */
export function useStoreState<S>(store: ExternalStore<S>): S {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
