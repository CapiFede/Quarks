import { useEffect, useRef, useState, type CSSProperties } from "react";
import { QuarkToolbar, IconButton, Icon, TextInput, Toggle } from "@quarks/core";
import type { ConsoleStore } from "../store";
import { useConsoleState } from "../hooks/useConsoleStore";
import type { ConsoleSession, ShellOption } from "../types";

export interface ConsoleToolbarProps {
  store: ConsoleStore;
}

/**
 * Toolbar del console quark. Un único strip a la izquierda con los chips de
 * las sesiones (del space activo) seguido inmediatamente del botón "+", para
 * que abrir una nueva quede al lado de la última pestaña — no perdido en la
 * esquina derecha.
 *
 * Doble click sobre un chip → entra en modo edición y se puede renombrar la
 * sesión; Enter o blur commitea, Escape cancela. El nombre custom se persiste
 * en disco con la sesión.
 */
export function ConsoleToolbar({ store }: ConsoleToolbarProps) {
  const { sessions, activeSessionId, shells } = useConsoleState(store);
  const [editingId, setEditingId] = useState<string | null>(null);

  // El strip de chips es scrollable (overflowX: auto), así que NO podemos
  // meter el "+" adentro: cualquier dropdown sería clippeado por el viewport
  // del scroll. Lo dejamos como hermano inmediato del strip → visualmente
  // queda al lado del último chip pero sin escapar del scroll container.
  return (
    <QuarkToolbar
      left={
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            height: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              overflowX: "auto",
              minWidth: 0,
              flex: "0 1 auto",
              height: "100%",
            }}
          >
            {sessions.map((s) =>
              editingId === s.id ? (
                <RenameField
                  key={s.id}
                  initial={s.name ?? ""}
                  onCommit={(v) => {
                    store.renameSession(s.id, v);
                    setEditingId(null);
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <SessionChip
                  key={s.id}
                  session={s}
                  selected={s.id === activeSessionId}
                  onClick={() => store.selectSession(s.id)}
                  onDoubleClick={() => setEditingId(s.id)}
                  onClose={() => void store.closeSession(s.id)}
                />
              ),
            )}
          </div>
          {/* Fuera del scroll: el popover se renderea sin que el overflow
              del strip lo recorte. */}
          <NewSessionMenu store={store} shells={shells} />
        </div>
      }
    />
  );
}

function SessionChip({
  session,
  selected,
  onClick,
  onDoubleClick,
  onClose,
}: {
  session: ConsoleSession;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState(false);

  const label = labelFor(session);
  const dead = session.exitCode !== null;

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={tooltipFor(session)}
      style={{ ...chipStyle(selected, hover, dead), gap: 4 }}
    >
      {session.elevated && (
        <Icon
          name="shield"
          size={12}
          color={selected ? "var(--q-primary-light)" : "var(--q-text-secondary)"}
        />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>
        {label}
      </span>
      {(selected || hover) && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          title="Cerrar sesión"
          style={{ display: "inline-flex", marginLeft: 2, marginRight: -4, padding: 1 }}
        >
          <Icon name="close" size={12} color="var(--q-text-secondary)" />
        </span>
      )}
    </div>
  );
}

/**
 * Field inline para renombrar: monta enfocado, Enter / blur committea, Escape
 * cancela. Si el usuario dejó vacío, el store cae a `name = null` y el chip
 * vuelve al label auto (cwd o shell).
 */
function RenameField({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  // Evita que el blur dispare onCommit DESPUÉS de un Escape (porque el blur
  // se gatilla tras el unmount). El committed se marca true cuando ya
  // hicimos algo final (commit o cancel) para hacer no-op en cualquier blur
  // residual.
  const settled = useRef(false);
  return (
    <span style={{ flex: "0 0 auto" }}>
      <TextInput
        value={value}
        onChange={setValue}
        autoFocus
        placeholder="Nombre…"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            settled.current = true;
            onCommit(value);
          } else if (e.key === "Escape") {
            settled.current = true;
            onCancel();
          }
        }}
        onBlur={() => {
          if (!settled.current) onCommit(value);
        }}
        style={{ height: 24, width: 150 }}
      />
    </span>
  );
}

function labelFor(s: ConsoleSession): string {
  // Custom name > último segmento del cwd > shell sin .exe.
  if (s.name) return s.name;
  if (s.cwd) {
    const parts = s.cwd.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? s.cwd;
  }
  const name = s.shell.split(/[\\/]/).pop() ?? s.shell;
  return name.replace(/\.exe$/i, "");
}

function tooltipFor(s: ConsoleSession): string {
  // En el tooltip mostramos lo más útil: cwd real si lo conocemos, sino shell.
  // Si hay name custom, lo prependemos para no perder el contexto.
  const base = s.cwd ?? s.shell;
  const full = s.name ? `${s.name} — ${base}` : base;
  if (s.exitCode !== null) return `${full} (terminado con código ${s.exitCode})`;
  if (s.elevated) return `${full} — administrador`;
  return full;
}

function chipStyle(selected: boolean, hover: boolean, dead: boolean): CSSProperties {
  return {
    position: "relative",
    flex: "0 0 auto",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    height: 26,
    margin: "0 1px",
    fontSize: 12,
    fontWeight: selected ? 600 : 500,
    color: dead
      ? "var(--q-text-light)"
      : selected || hover
        ? "var(--q-text-primary)"
        : "var(--q-text-secondary)",
    background: selected
      ? "var(--q-surface-alt)"
      : hover
        ? "var(--q-card-hover)"
        : "transparent",
    borderRadius: 6,
    cursor: "default",
    whiteSpace: "nowrap",
    fontStyle: dead ? "italic" : "normal",
    transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
  };
}

// ── Menú "+" (nueva sesión por shell, toggle admin) ───────────────────────────

/**
 * Una sola lista de shells disponibles, con un toggle "Admin" en el header
 * del dropdown. Toggle off (default) = sesión normal; on = la próxima opción
 * que clickees se abre elevada con UAC. El toggle persiste mientras esté
 * abierto el dropdown — no se resetea entre opens.
 */
function NewSessionMenu({
  store,
  shells,
}: {
  store: ConsoleStore;
  shells: ShellOption[];
}) {
  const [open, setOpen] = useState(false);
  const [asAdmin, setAsAdmin] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const create = (shell: ShellOption) => async () => {
    setOpen(false);
    try {
      await store.createSession({ shell, elevated: asAdmin });
    } catch (e) {
      console.warn("[console] no se pudo crear sesión", e);
    }
  };

  // Fallback si por alguna razón el backend devolvió lista vacía: el menú
  // sigue funcionando con el default shell, sin args ni env extras.
  const items: ShellOption[] =
    shells.length > 0
      ? shells
      : [
          {
            id: "default",
            label: "Default",
            program: "",
            args: [],
            env: [],
            available: true,
          },
        ];

  return (
    <span
      ref={ref}
      style={{ position: "relative", display: "inline-flex", marginLeft: 2 }}
    >
      <IconButton
        name="add"
        tooltip="Nueva sesión"
        selected={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 1000,
            minWidth: 240,
            padding: 4,
            background: "var(--q-surface)",
            border: "1px solid var(--q-border-light)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,.4)",
          }}
        >
          <AdminHeader checked={asAdmin} onChange={setAsAdmin} />
          <Divider />
          {items.map((s) => (
            <MenuItem
              key={s.id}
              // `shield` cuando el toggle de admin está activo, sino terminal
              // común — feedback visual claro de qué va a pasar al clickear.
              icon={asAdmin ? "shield" : "terminal"}
              label={s.label}
              hint={s.program || undefined}
              onClick={create(s)}
            />
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * Header del dropdown con label "Nueva sesión" a la izquierda y toggle
 * "Admin" a la derecha. El toggle convierte cualquier clic posterior en una
 * sesión elevada (UAC).
 */
function AdminHeader({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 10px 6px 10px",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "var(--q-text-light)",
        }}
      >
        Nueva sesión
      </span>
      <span
        // El clic en cualquier parte del label/toggle alterna el toggle.
        // stopPropagation evita que el listener del documento cierre el
        // dropdown al clickear el toggle.
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          cursor: "default",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: checked ? "var(--q-primary-light)" : "var(--q-text-light)",
          }}
        >
          Admin
        </span>
        <Toggle checked={checked} onChange={onChange} />
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "var(--q-border)", margin: "4px 6px" }} />;
}

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 32,
        padding: "4px 8px",
        borderRadius: 6,
        fontSize: 12.5,
        cursor: "default",
        whiteSpace: "nowrap",
        background: hover ? "var(--q-card-hover)" : "transparent",
        color: hover ? "var(--q-text-primary)" : "var(--q-text-secondary)",
        transition:
          "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={17} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: 10.5, color: "var(--q-text-light)" }}>{hint}</span>}
      </div>
    </div>
  );
}
