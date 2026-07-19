import { useEffect, useRef } from "react";
import type { ConsoleStore } from "../store";
import type { ConsoleSession } from "../types";

export interface TerminalHostProps {
  store: ConsoleStore;
  sessions: ConsoleSession[];
  activeId: string | null;
}

/**
 * Host del xterm de la sesión activa. El truco: el `Terminal` de xterm vive
 * en el store dentro de un `container` detached (uno por sesión); este
 * componente solo lo mueve al `hostRef` cuando la sesión es la activa, y lo
 * devuelve al limbo al desmontar / cambiar. Así NO remontamos el xterm al
 * cambiar de sesión: se preserva scrollback, posición de cursor y selección.
 *
 * Un `ResizeObserver` notifica al store cuando el host cambia de tamaño
 * (ej: el usuario maximiza la ventana, abre/cierra Quarky), para que llame
 * `fit()` y propague el resize al PTY.
 */
export function TerminalHost({ store, sessions, activeId }: TerminalHostProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId || !hostRef.current) return;
    const detach = store.attachToHost(activeId, hostRef.current);
    return detach;
  }, [store, activeId]);

  // Resize observer: refit + resize PTY ante cambios de tamaño del host.
  useEffect(() => {
    if (!hostRef.current) return;
    const ro = new ResizeObserver(() => {
      store.resizeActive();
    });
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, [store]);

  // Si la sesión activa cambió, también refit (el container nuevo puede
  // tener tamaño cero en el primer frame).
  useEffect(() => {
    const t = setTimeout(() => store.resizeActive(), 0);
    return () => clearTimeout(t);
  }, [activeId, store]);

  // Activamos un overlay liviano cuando NO hay sesión activa pero hay
  // sesiones (caso transitorio mientras se carga el space).
  if (!activeId && sessions.length > 0) {
    return <div className="q-console-host" />;
  }

  return <div ref={hostRef} className="q-console-host" />;
}
