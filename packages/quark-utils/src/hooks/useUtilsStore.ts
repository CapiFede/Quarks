import { useSyncExternalStore } from "react";
import type { UtilsStore } from "../store";
import type { UtilsState } from "../types";

export function useUtilsState(store: UtilsStore): UtilsState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
