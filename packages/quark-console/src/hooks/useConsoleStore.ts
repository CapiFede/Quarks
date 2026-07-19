import { useSyncExternalStore } from "react";
import type { ConsoleStore } from "../store";
import type { ConsoleState } from "../types";

export function useConsoleState(store: ConsoleStore): ConsoleState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
