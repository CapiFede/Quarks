import { useCallback, useEffect, useState } from "react";
import { getQuark } from "../../quark/registry";
import type { AppState } from "../../services/appState";
import { saveAppState } from "../../services/appState";
import { isAndroid } from "../../services/platform";
import { report, withScope } from "../../services/log";

export type ActiveTab = string; // 'home' | quarkId

/**
 * Tabs que el shell mantiene fijos en Android: siempre abiertos, sin × y con
 * `music` como activo por defecto. No hay Home en mobile: es el único launcher.
 */
export const ANDROID_PINNED_TABS = ["music", "notes"] as const;

export interface Shell {
  openTabs: string[];
  active: ActiveTab;
  /** id del Space activo (crudo; el Shell lo resuelve contra la lista de spaces). */
  activeSpace: string;
  /** Abre el quark (si no estaba) y lo activa. */
  openTab: (id: string) => void;
  /** Cierra el tab; activa el anterior, o Home si no queda ninguno. */
  closeTab: (id: string) => void;
  /** Activa un tab ya abierto (o 'home'). */
  activate: (id: ActiveTab) => void;
  /** Mueve `draggedId` a la posición que ocupa `targetId` (drag de tabs). */
  reorderTab: (draggedId: string, targetId: string) => void;
  /** Cambia el Space activo (persistido en appState). */
  setActiveSpace: (id: string) => void;
}

interface ShellState {
  openTabs: string[];
  active: ActiveTab;
  activeSpace: string;
}

/** Saneo del estado persistido contra el registro actual de quarks. */
function sanitize(state: AppState): ShellState {
  if (isAndroid) {
    // Android: garantizar que los pinneados (music+notes) estén abiertos al
    // frente; admitir tabs adicionales del estado persistido detrás. 'home' no
    // existe — si el activo persistido era 'home' o algo desconocido, cae al
    // primer pinneado disponible (`music`).
    const openTabs: string[] = ANDROID_PINNED_TABS.filter((id) => getQuark(id));
    for (const id of state.openTabs) {
      if (!openTabs.includes(id) && getQuark(id)) openTabs.push(id);
    }
    const active = openTabs.includes(state.activeTab)
      ? state.activeTab
      : openTabs[0] ?? "music";
    return { openTabs, active, activeSpace: state.activeSpace };
  }
  const openTabs = state.openTabs.filter((id) => getQuark(id));
  const active =
    state.activeTab === "home" || openTabs.includes(state.activeTab)
      ? state.activeTab
      : "home";
  // `activeSpace` se copia tal cual: appState no conoce la lista de spaces
  // (vive en settings). El Shell valida con `resolveActive` al leer.
  return { openTabs, active, activeSpace: state.activeSpace };
}

/**
 * Estado del shell: tabs abiertos, tab activo y su persistencia.
 * El estado inicial llega ya cargado desde disco (ver `App.tsx`).
 */
export function useShell(initial: AppState): Shell {
  const [state, setState] = useState<ShellState>(() => sanitize(initial));

  useEffect(() => {
    void withScope("appState.save", () =>
      saveAppState({
        openTabs: state.openTabs,
        activeTab: state.active,
        activeSpace: state.activeSpace,
      }),
    ).catch(report);
  }, [state]);

  const openTab = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
      active: id,
    }));
  }, []);

  const activate = useCallback((id: ActiveTab) => {
    setState((s) => (s.active === id ? s : { ...s, active: id }));
  }, []);

  const setActiveSpace = useCallback((id: string) => {
    setState((s) => (s.activeSpace === id ? s : { ...s, activeSpace: id }));
  }, []);

  const reorderTab = useCallback((draggedId: string, targetId: string) => {
    setState((s) => {
      if (draggedId === targetId) return s;
      const from = s.openTabs.indexOf(draggedId);
      const to = s.openTabs.indexOf(targetId);
      if (from === -1 || to === -1) return s;
      const openTabs = [...s.openTabs];
      openTabs.splice(from, 1);
      openTabs.splice(to, 0, draggedId);
      return { ...s, openTabs };
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    // En Android `music` y `notes` son pinneados — nunca se cierran.
    if (isAndroid && (ANDROID_PINNED_TABS as readonly string[]).includes(id)) {
      return;
    }
    setState((s) => {
      const idx = s.openTabs.indexOf(id);
      if (idx === -1) return s;
      const openTabs = s.openTabs.filter((x) => x !== id);
      let active = s.active;
      if (active === id) {
        // Sin tabs queda `home` en desktop; en Android cae al primer pinneado.
        const fallback = isAndroid ? "music" : "home";
        active = openTabs.length === 0 ? fallback : (openTabs[Math.max(0, idx - 1)] ?? fallback);
      }
      return { ...s, openTabs, active };
    });
  }, []);

  return {
    openTabs: state.openTabs,
    active: state.active,
    activeSpace: state.activeSpace,
    openTab,
    closeTab,
    activate,
    reorderTab,
    setActiveSpace,
  };
}
