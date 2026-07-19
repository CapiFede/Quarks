import { useSyncExternalStore } from "react";
import type { MusicStore, MusicState } from "../store";

/**
 * Suscribe un componente al store y devuelve el estado completo. El snapshot es
 * una referencia estable hasta que el estado cambia, así que es seguro con
 * `useSyncExternalStore`. Para que el tick de posición (cada 250ms) no
 * re-renderice la lista de tracks, los hijos pesados van con `React.memo`:
 * solo se re-renderizan cuando cambian sus props, no en cada tick.
 */
export function useMusicState(store: MusicStore): MusicState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
