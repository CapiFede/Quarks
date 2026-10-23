import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * Estado de un menú/popover desplegable anclado a `ref`: se cierra con un click
 * afuera o con Escape. `run` envuelve una acción para que además lo cierre.
 * El contenedor que recibe `ref` tiene que ser `position: relative` para que el
 * `MenuPanel` se ancle a él.
 */
export function useMenu<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

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

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return { open, setOpen, ref, run };
}

/**
 * Panel flotante del menú. Va dentro de un contenedor `position: relative`;
 * `align` elige el borde al que se pega y `up` lo abre hacia arriba.
 */
export function MenuPanel({
  align = "left",
  up = false,
  minWidth = 200,
  maxWidth,
  children,
}: {
  align?: "left" | "right";
  up?: boolean;
  minWidth?: number;
  maxWidth?: number;
  children: ReactNode;
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        ...(up ? { bottom: "calc(100% + 6px)" } : { top: "calc(100% + 6px)" }),
        ...(align === "left" ? { left: 0 } : { right: 0 }),
        zIndex: 1000,
        minWidth,
        maxWidth,
        maxHeight: 320,
        overflowY: "auto",
        padding: 4,
        background: "var(--q-surface)",
        border: "1px solid var(--q-border-light)",
        borderRadius: 8,
        boxShadow: "0 10px 28px rgba(0,0,0,.4)",
      }}
    >
      {children}
    </div>
  );
}

export function MenuDivider() {
  return <div style={{ height: 1, background: "var(--q-border)", margin: "4px 6px" }} />;
}

/** Texto tenue para menús vacíos ("No hay conversaciones todavía."). */
export function MenuHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-light)",
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  label,
  count,
  checked,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  /** Número tenue a la derecha del nombre (p. ej. cuántas canciones tiene). */
  count?: number;
  checked?: boolean;
  /** Acción destructiva: en rojo. */
  danger?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const color = danger
    ? "var(--q-error)"
    : checked
      ? "var(--q-primary-light)"
      : hover
        ? "var(--q-text-primary)"
        : "var(--q-text-secondary)";
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 32,
        padding: "0 8px",
        borderRadius: 6,
        fontSize: 12.5,
        cursor: "default",
        whiteSpace: "nowrap",
        background: hover ? "var(--q-card-hover)" : "transparent",
        color,
        transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={17} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        {count !== undefined && (
          <span style={{ flexShrink: 0, fontSize: 11, color: "var(--q-text-light)" }}>{count}</span>
        )}
      </span>
      {checked && <Icon name="check" size={15} color="var(--q-primary-light)" />}
    </div>
  );
}
