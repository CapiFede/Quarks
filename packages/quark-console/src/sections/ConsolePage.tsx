import { useEffect } from "react";
import { Button, Icon, useActiveSpace } from "@quarks/core";
import type { ConsoleStore } from "../store";
import { useConsoleState } from "../hooks/useConsoleStore";
import { TerminalHost } from "./TerminalHost";
import "@xterm/xterm/css/xterm.css";
import "../styles/console.css";

export interface ConsolePageProps {
  store: ConsoleStore;
}

export function ConsolePage({ store }: ConsolePageProps) {
  const state = useConsoleState(store);
  const space = useActiveSpace();

  // El space activo (core) particiona las sesiones. Cambiar de space mata las
  // sesiones del space saliente y restaura las del entrante (ver `setSpace`).
  useEffect(() => {
    void store.setSpace(space.id);
  }, [store, space.id]);

  if (!state.loaded || state.spaceId !== space.id) {
    return (
      <div className="q-console-page">
        <div className="q-console-empty">
          <Icon name="sync" size={36} color="var(--q-text-light)" />
          <div className="q-console-empty-text">Cargando sesiones…</div>
        </div>
      </div>
    );
  }

  if (state.sessions.length === 0) {
    // Para los botones del empty-state pre-elegimos el primer shell disponible
    // (típicamente PowerShell 7 si está instalado), así heredamos `-NoLogo` y
    // demás args/env y la consola arranca limpia. El selector del "+" en la
    // toolbar sigue mostrando todas las opciones.
    const defaultPick = state.shells[0];
    return (
      <div className="q-console-page">
        <div className="q-console-empty">
          <Icon name="terminal" size={48} color="var(--q-text-light)" />
          <div className="q-console-empty-text">Sin sesiones abiertas en este Space.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="filled"
              icon="add"
              onClick={() => void store.createSession({ shell: defaultPick })}
            >
              Nueva sesión
            </Button>
            <Button
              variant="outlined"
              icon="shield"
              onClick={() =>
                void store.createSession({ shell: defaultPick, elevated: true })
              }
            >
              Nueva sesión (admin)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="q-console-page">
      <TerminalHost store={store} sessions={state.sessions} activeId={state.activeSessionId} />
    </div>
  );
}
