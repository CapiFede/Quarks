import { useEffect, useRef, useState, type ReactNode } from "react";
import { WindowFrame } from "./WindowFrame";
import { TitleBar } from "./TitleBar";
import { Home } from "./Home";
import { Placeholder } from "./Placeholder";
import { Settings, type SectionId } from "./Settings";
import { Panel as QuarkyPanel } from "./Quarky/Panel";
import { getQuark, getQuarkInstance } from "../../quark/registry";
import { useShell, ANDROID_PINNED_TABS } from "../hooks/useShell";
import { isAndroid } from "../../services/platform";
import { useShellHotkeys } from "../hooks/useShellHotkeys";
import { useReloadShortcut } from "../hooks/useReloadShortcut";
import { useSettings } from "../hooks/useSettings";
import { useAccount } from "../hooks/useAccount";
import { useSpaces } from "../hooks/useSpaces";
import { useUpdater } from "../hooks/useUpdater";
import { SpaceProvider } from "../hooks/useActiveSpace";
import { QuarkyProvider, useQuarky } from "../../quarky/hooks/useQuarky";
import { useQuarkyHotkeys } from "../../quarky/hooks/useQuarkyHotkeys";
import { report, withScope } from "../../services/log";
import {
  getPendingQuark,
  clearPendingQuark,
  getPendingSpace,
  clearPendingSpace,
  subscribeNavigation,
} from "../../services/navigation";
import type { AppState } from "../../services/appState";
import type { AppSettings } from "../../services/settings";
import type { AccountInfo } from "../../services/account/types";

export interface ShellProps {
  initialAppState: AppState;
  initialSettings: AppSettings;
  initialAccount: AccountInfo | null;
}

/** Shell de la app: titlebar + tabs + panes + popup de Settings. */
export function Shell({ initialAppState, initialSettings, initialAccount }: ShellProps) {
  const shell = useShell(initialAppState);
  const settingsCtl = useSettings(initialSettings);
  const { settings, update } = settingsCtl;
  const spaces = useSpaces(settingsCtl, shell);
  const { account, status, error, connect, disconnect } = useAccount(initialAccount);
  const updater = useUpdater();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SectionId | undefined>();

  useShellHotkeys(shell);
  useReloadShortcut();
  useQuarkLifecycle(shell.openTabs);

  // El nombre que se muestra en el Home sale del usuario logueado: al conectar
  // (o reconectar) una cuenta, reflejamos su nombre en settings. Ya no hay un
  // campo manual de "Nombre", así que esta es la única fuente del display name.
  useEffect(() => {
    if (account?.name && account.name !== settings.displayName) {
      update({ displayName: account.name });
    }
  }, [account, settings.displayName, update]);

  // Un quark puede pedir el foco de su tab (alarma sonando, fin de timer) o la
  // activación de un space (abrir una playlist de otro space desde Música). El
  // store vive en otro paquete y publica en el bus de navegación; acá lo
  // consumimos.
  useEffect(() => {
    const consume = () => {
      const id = getPendingQuark();
      if (id) {
        clearPendingQuark();
        shell.openTab(id);
      }
      const spaceId = getPendingSpace();
      if (spaceId) {
        clearPendingSpace();
        // Ignorar ids que no correspondan a un space definido (pedido viejo /
        // space borrado entre que se publicó y se consumió).
        if (spaces.spaces.some((s) => s.id === spaceId)) spaces.setActive(spaceId);
      }
    };
    consume(); // por si quedó un pedido publicado antes de montar el Shell
    return subscribeNavigation(consume);
  }, [shell.openTab, spaces.spaces, spaces.setActive]);

  /** Abre Settings, opcionalmente en una sección puntual. */
  const openSettings = (section?: SectionId) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const tabs = shell.openTabs
    .map((id) => getQuark(id))
    .filter((q) => q !== undefined)
    .map((q) => ({ id: q.id, name: q.name, icon: q.icon }));

  // Toolbar del quark activo (si lo aporta). Home y los quarks sin instancia
  // no muestran sub-toolbar.
  const activeInstance =
    shell.active === "home" ? undefined : getQuarkInstance(shell.active);
  const toolbar = activeInstance?.buildToolbar?.() ?? null;

  return (
    <WindowFrame>
      <QuarkyProvider
        activeSpaceId={spaces.active.id}
        activeQuarkId={shell.active === "home" ? null : shell.active}
        resolveAiContext={(id) => getQuarkInstance(id)?.buildAiContext?.() ?? null}
        onOpenSettings={() => openSettings("quarky")}
      >
        <TitleBar
          active={shell.active}
          tabs={tabs}
          onActivate={shell.activate}
          onCloseTab={shell.closeTab}
          onReorderTab={shell.reorderTab}
          pinnedTabs={isAndroid ? [...ANDROID_PINNED_TABS] : undefined}
          spaces={spaces.spaces}
          activeSpaceId={spaces.active.id}
          onOpenSettings={() => openSettings()}
          updateAvailable={updater.status === "available"}
          onClickUpdate={() => openSettings("general")}
        />

        {/* SpaceProvider envuelve la toolbar Y los panes: ambos consumen el space
            activo (la toolbar del quark también lo necesita para sus playlists).
            Cada pane se mantiene montado; los inactivos se ocultan con display:none
            para preservar el estado interno del quark al cambiar de tab. */}
        <SpaceProvider space={spaces.active}>
          {toolbar}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {/* Home solo en desktop: en Android no existe (music + notes son los
                tabs fijos y el activo es uno de ellos, nunca 'home'). */}
            {!isAndroid && (
              <Pane visible={shell.active === "home"}>
                <Home
                  displayName={settings.displayName}
                  account={account}
                  onOpen={shell.openTab}
                  onSettings={() => openSettings()}
                  onLogin={() => openSettings("account")}
                />
              </Pane>
            )}
            {shell.openTabs.map((id) => {
              const instance = getQuarkInstance(id);
              return (
                <Pane key={id} visible={shell.active === id}>
                  {instance ? instance.buildPage() : <Placeholder quark={getQuark(id)} />}
                </Pane>
              );
            })}
          </div>
        </SpaceProvider>

        <Settings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialSection={settingsSection}
          spaces={spaces.spaces}
          activeSpaceId={spaces.active.id}
          onSelectSpace={spaces.setActive}
          onCreateSpace={spaces.create}
          onRenameSpace={spaces.rename}
          onDeleteSpace={spaces.remove}
          account={account}
          status={status}
          error={error}
          onConnect={connect}
          onDisconnect={disconnect}
          updater={updater}
        />

        {/* Panel global de Quarky: overlay derecho, abre/cierra con F4. Va
            adentro de SpaceProvider para que pueda leer el space activo si en el
            futuro lo necesita (M5, para inyectar `buildAiContext` del quark). */}
        <QuarkyPanel />
        <ShellSideEffects
          settingsOpen={settingsOpen}
          activeTab={shell.active}
        />
      </QuarkyProvider>
    </WindowFrame>
  );
}

/**
 * Componente sin render: aloja los efectos que necesitan estar dentro del
 * `QuarkyProvider` (la cadena de Escape consulta `panelOpen` y el hotkey de F4
 * dispara `toggle`). Lo separamos del Shell para no convertir todo el árbol
 * en consumidor del context y no tener que reordenar los hooks de arriba.
 */
function ShellSideEffects({
  settingsOpen,
  activeTab,
}: {
  settingsOpen: boolean;
  activeTab: string;
}) {
  const quarky = useQuarky();
  useQuarkyHotkeys({ settingsOpen });

  // Cadena de Escape: Settings maneja el suyo aparte (modal); acá el orden es
  //   1. Quarky panel abierto → cerrarlo.
  //   2. Quark activo: `onEscape?.()` (search drawer, deselect, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || settingsOpen) return;
      if (quarky.panelOpen) {
        e.preventDefault();
        quarky.close();
        return;
      }
      if (activeTab === "home") return;
      if (getQuarkInstance(activeTab)?.onEscape?.()) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, activeTab, quarky.panelOpen, quarky.close]);

  return null;
}

/**
 * Ciclo de vida de los quarks abiertos: `initialize()` la primera vez que se
 * abre cada quark (etiquetado con su id vía `withScope`, según el contrato) y
 * `dispose()` cuando su tab se cierra. El `Set` en un ref evita doble init bajo
 * StrictMode y sobrevive a los re-renders.
 */
function useQuarkLifecycle(openTabs: string[]) {
  const initialized = useRef<Set<string>>(new Set());
  const prevTabs = useRef<string[]>([]);

  useEffect(() => {
    // Init de los recién abiertos.
    for (const id of openTabs) {
      const instance = getQuarkInstance(id);
      if (instance && !initialized.current.has(id)) {
        initialized.current.add(id);
        void withScope(`${id}.initialize`, () => instance.initialize()).catch(report);
      }
    }
    // Dispose de los que se cerraron desde el render anterior.
    for (const id of prevTabs.current) {
      if (!openTabs.includes(id) && initialized.current.has(id)) {
        initialized.current.delete(id);
        try {
          getQuarkInstance(id)?.dispose();
        } catch (e) {
          report(`${id}.dispose`, e);
        }
      }
    }
    prevTabs.current = openTabs;
  }, [openTabs]);
}

function Pane({ visible, children }: { visible: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "auto",
        display: visible ? "block" : "none",
      }}
    >
      {children}
    </div>
  );
}
