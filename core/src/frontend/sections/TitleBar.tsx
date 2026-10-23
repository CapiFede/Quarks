import {
  forwardRef,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "../components/Icon";
import { isAndroid } from "../../services/platform";

export interface TabDescriptor {
  id: string;
  name: string;
  /** Nombre de la ligatura de Material Symbols. */
  icon?: string;
}

export interface TitleBarProps {
  active: string;
  tabs: TabDescriptor[];
  onActivate: (id: string) => void;
  onCloseTab: (id: string) => void;
  /** Reordena tabs arrastrando: mueve `draggedId` a la posición de `targetId`. */
  onReorderTab: (draggedId: string, targetId: string) => void;
  /** ids de tabs que NO pueden cerrarse (no muestran el × en su pill). */
  pinnedTabs?: string[];
  /** Click en la tuerca = abrir Settings. */
  onOpenSettings: () => void;
  /** Si hay update lista, la tuerca lleva un punto y el click salta a "Acerca de". */
  updateAvailable?: boolean;
  onClickUpdate?: () => void;
}

// `getCurrentWindow()` y sus métodos de control (minimize/maximize/close) no
// aplican en Android — la ventana la maneja el OS. Solo lo usamos en desktop.
const appWindow = isAndroid ? null : getCurrentWindow();

/** Reservado a la derecha del strip para el chip "+N" cuando hay overflow. */
const OVERFLOW_RESERVE = 44;

/**
 * Titlebar con tabs de ancho dinámico, colapso a "+N" en overflow y popover de
 * tabs ocultos. Un solo activo visual: 'home' o uno de los tabs abiertos.
 */
export function TitleBar({
  active,
  tabs,
  onActivate,
  onCloseTab,
  onReorderTab,
  pinnedTabs,
  onOpenSettings,
  updateAvailable,
  onClickUpdate,
}: TitleBarProps) {
  // En Android no existe "Home" — el primer tab del strip es el activo por
  // defecto y no hay pill de Home a la izquierda.
  const homeActive = !isAndroid && active === "home";
  const pinned = new Set(pinnedTabs ?? []);

  const stripRef = useRef<HTMLDivElement>(null);
  const measurerRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tabs.length);
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Drag de reordenamiento: id del tab que se arrastra y sobre cuál está.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Mide los anchos naturales (row oculto) y calcula cuántos tabs entran.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const measurer = measurerRef.current;
    if (!strip || !measurer) return;

    const compute = () => {
      const avail = strip.clientWidth;
      const widths = Array.from(measurer.children).map(
        (c) => (c as HTMLElement).offsetWidth + 2, // + margen horizontal del pill
      );
      const total = widths.reduce((a, b) => a + b, 0);

      if (tabs.length === 0 || total <= avail) {
        setVisibleCount(tabs.length);
        return;
      }
      let used = 0;
      let n = 0;
      for (const w of widths) {
        if (used + w <= avail - OVERFLOW_RESERVE) {
          used += w;
          n++;
        } else break;
      }
      setVisibleCount(n);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(strip);
    // Las fuentes (Nunito) cambian anchos al cargar: recalcular cuando estén listas.
    document.fonts?.ready.then(compute).catch(() => {});
    return () => ro.disconnect();
  }, [tabs, active]);

  const visibleTabs = tabs.slice(0, visibleCount);
  const hiddenTabs = tabs.slice(visibleCount);

  // Si desaparece el overflow, cerrar el popover.
  useEffect(() => {
    if (hiddenTabs.length === 0 && popoverOpen) setPopoverOpen(false);
  }, [hiddenTabs.length, popoverOpen]);

  return (
    <div
      data-tauri-drag-region
      style={{
        height: 34,
        flex: "0 0 34px",
        display: "flex",
        alignItems: "stretch",
        background: "var(--q-titlebar-bg)",
        borderBottom: "1px solid rgba(0,0,0,.18)",
        paddingLeft: 6,
      }}
    >
      {!isAndroid && (
        <TabPill label="Home" active={homeActive} onClick={() => onActivate("home")} />
      )}

      {/* Strip flexible con los tabs de quarks; recorta en overflow. */}
      <div
        ref={stripRef}
        data-tauri-drag-region
        style={{
          position: "relative",
          flex: "1 1 auto",
          minWidth: 0,
          display: "flex",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
        {visibleTabs.map((t, i) => {
          const isActive = active === t.id;
          // En Android no hay pill de Home a la izquierda, así que el "previo"
          // del primer tab visible no existe (no se dibuja separador antes).
          const prevId =
            i === 0 ? (isAndroid ? null : "home") : visibleTabs[i - 1].id;
          const showSep = prevId !== null && !isActive && active !== prevId;
          const closable = !pinned.has(t.id);
          return (
            <Fragment key={t.id}>
              {showSep && <Separator />}
              <TabPill
                label={t.name}
                icon={t.icon}
                active={isActive}
                closable={closable}
                onClose={closable ? () => onCloseTab(t.id) : undefined}
                onClick={() => onActivate(t.id)}
                draggable
                dragging={dragId === t.id}
                dropTarget={dragOverId === t.id && dragId !== t.id}
                onDragStart={(e) => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = "move";
                  // Algún payload es necesario para que Firefox arranque el drag.
                  e.dataTransfer.setData("text/plain", t.id);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === t.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverId !== t.id) setDragOverId(t.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== t.id) onReorderTab(dragId, t.id);
                  setDragId(null);
                  setDragOverId(null);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDragOverId(null);
                }}
              />
            </Fragment>
          );
        })}

        {hiddenTabs.length > 0 && (
          <OverflowChip
            ref={chipRef}
            count={hiddenTabs.length}
            active={popoverOpen}
            onClick={() => setPopoverOpen((v) => !v)}
          />
        )}

        {/* Row medidor oculto: mismos pills para conocer sus anchos naturales. */}
        <div
          ref={measurerRef}
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            display: "flex",
            visibility: "hidden",
            pointerEvents: "none",
          }}
        >
          {tabs.map((t) => (
            <TabPill
              key={t.id}
              label={t.name}
              icon={t.icon}
              active={active === t.id}
              closable={!pinned.has(t.id)}
            />
          ))}
        </div>
      </div>

      <SettingsButton
        onClick={updateAvailable && onClickUpdate ? onClickUpdate : onOpenSettings}
        updateBadge={!!updateAvailable}
      />
      {/* Controles de ventana solo en desktop: Android no decora la ventana. */}
      {!isAndroid && appWindow && (
        <>
          <Separator />
          <ChromeButton icon="remove" onClick={() => appWindow.minimize()} />
          <ChromeButton
            icon="crop_square"
            iconSize={12}
            onClick={() => appWindow.toggleMaximize()}
          />
          <ChromeButton icon="close" isClose onClick={() => appWindow.close()} />
        </>
      )}

      {popoverOpen && hiddenTabs.length > 0 && (
        <OverflowPopover
          anchor={chipRef.current}
          tabs={hiddenTabs}
          active={active}
          onActivate={(id) => {
            onActivate(id);
            setPopoverOpen(false);
          }}
          onClose={onCloseTab}
          onDismiss={() => setPopoverOpen(false)}
        />
      )}
    </div>
  );
}

function Separator() {
  return (
    <div
      style={{
        alignSelf: "center",
        width: 1,
        height: 14,
        background: "rgba(255,255,255,.20)",
        margin: "0 1px",
        flex: "0 0 auto",
      }}
    />
  );
}

interface TabPillProps {
  label: string;
  icon?: string;
  active: boolean;
  closable?: boolean;
  onClose?: () => void;
  onClick?: () => void;
  draggable?: boolean;
  /** Este pill se está arrastrando (se atenúa). */
  dragging?: boolean;
  /** Otro pill se arrastra por encima de éste (marca de inserción a la izq.). */
  dropTarget?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onDragEnd?: () => void;
}

function TabPill({
  label,
  icon,
  active,
  closable,
  onClose,
  onClick,
  draggable,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: TabPillProps) {
  const [hover, setHover] = useState(false);
  const bg = active
    ? "var(--q-chrome-active)"
    : hover
      ? "var(--q-chrome-hover)"
      : "transparent";
  const color = active
    ? "#fff"
    : hover
      ? "rgba(255,255,255,.9)"
      : "var(--q-chrome-idle)";

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        margin: "3px 1px",
        borderRadius: 5,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "default",
        whiteSpace: "nowrap",
        opacity: dragging ? 0.4 : 1,
        // Marca de inserción: línea a la izquierda del pill bajo el cursor.
        boxShadow: dropTarget
          ? "inset 2px 0 0 0 var(--q-primary-light)"
          : undefined,
      }}
    >
      {icon && <Icon name={icon} size={13} style={{ marginRight: 5 }} />}
      <span>{label}</span>
      {closable && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          style={{
            marginLeft: 3,
            padding: 2,
            borderRadius: 3,
            display: "inline-flex",
          }}
        >
          <Icon name="close" size={11} color={color} />
        </span>
      )}
    </div>
  );
}

interface OverflowChipProps {
  count: number;
  active: boolean;
  onClick: () => void;
}

const OverflowChip = forwardRef<HTMLDivElement, OverflowChipProps>(
  function OverflowChip({ count, active, onClick }, ref) {
  const [hover, setHover] = useState(false);
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      title={`${count} más`}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        margin: "3px 1px",
        borderRadius: 5,
        background: active
          ? "var(--q-chrome-active)"
          : hover
            ? "var(--q-chrome-hover)"
            : "transparent",
        color: active ? "#fff" : "var(--q-chrome-idle)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "default",
        whiteSpace: "nowrap",
      }}
    >
      +{count}
    </div>
  );
  },
);

interface OverflowPopoverProps {
  anchor: HTMLElement | null;
  tabs: TabDescriptor[];
  active: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onDismiss: () => void;
}

function OverflowPopover({
  anchor,
  tabs,
  active,
  onActivate,
  onClose,
  onDismiss,
}: OverflowPopoverProps) {
  const rect = anchor?.getBoundingClientRect();
  const width = 200;
  const left = rect
    ? Math.min(rect.left, window.innerWidth - width - 8)
    : 8;
  const top = rect ? rect.bottom + 2 : 36;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  return (
    <>
      {/* Backdrop para cerrar al clickear afuera. */}
      <div
        onClick={onDismiss}
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
      />
      <div
        style={{
          position: "fixed",
          top,
          left,
          width,
          zIndex: 41,
          background: "var(--q-surface)",
          border: "1px solid var(--q-border-dark)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,.28)",
          padding: 4,
        }}
      >
        {tabs.map((t) => (
          <PopoverItem
            key={t.id}
            tab={t}
            active={active === t.id}
            onActivate={() => onActivate(t.id)}
            onClose={() => onClose(t.id)}
          />
        ))}
      </div>
    </>
  );
}

function PopoverItem({
  tab,
  active,
  onActivate,
  onClose,
}: {
  tab: TabDescriptor;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onActivate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 6,
        cursor: "default",
        background: active
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: active ? "var(--q-primary-light)" : "var(--q-text-primary)",
      }}
    >
      {tab.icon && <Icon name={tab.icon} size={14} />}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: active ? 600 : 500,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {tab.name}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{ padding: 2, borderRadius: 3, display: "inline-flex" }}
      >
        <Icon name="close" size={12} color="var(--q-text-secondary)" />
      </span>
    </div>
  );
}

interface ChromeButtonProps {
  icon: string;
  iconSize?: number;
  isClose?: boolean;
  onClick?: () => void;
}

function ChromeButton({ icon, iconSize = 14, isClose, onClick }: ChromeButtonProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        width: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        background: hover
          ? isClose
            ? "var(--q-close-red)"
            : "var(--q-chrome-hover)"
          : "transparent",
        color: isClose && hover ? "#fff" : "rgba(255,255,255,.85)",
        cursor: "default",
      }}
    >
      <Icon name={icon} size={iconSize} />
    </div>
  );
}

// ── Botón de Settings ─────────────────────────────────────────────────────────

/**
 * Tuerca de Configuración, junto a los controles de ventana. El `updateBadge`
 * es un punto sobre la tuerca: notifica updates sin meter otro elemento en la
 * chrome.
 */
function SettingsButton({ onClick, updateBadge }: { onClick: () => void; updateBadge?: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      title={updateBadge ? "Hay una actualización disponible" : "Configuración"}
      style={{
        width: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        background: hover ? "var(--q-chrome-hover)" : "transparent",
        color: hover ? "var(--q-chrome-text)" : "var(--q-chrome-idle)",
        cursor: "default",
      }}
    >
      <span style={{ position: "relative", display: "inline-flex" }}>
        <Icon name="settings" size={16} />
        {updateBadge && (
          <span
            style={{
              position: "absolute",
              top: -1,
              right: -2,
              width: 7,
              height: 7,
              borderRadius: 9999,
              background: "var(--q-primary-light)",
              boxShadow: "0 0 0 1.5px var(--q-titlebar-bg)",
            }}
          />
        )}
      </span>
    </div>
  );
}
