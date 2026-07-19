import type { ReactNode } from "react";

export interface QuarkToolbarProps {
  /** Contenido alineado a la izquierda (chips, dropdowns del quark). */
  left?: ReactNode;
  /** Contenido alineado a la derecha (normalmente el grupo de IconButtons). */
  right?: ReactNode;
}

/**
 * Sub-toolbar de 30px del quark activo (§3 del plan: TitleBar → QuarkToolbar →
 * contenido). Es chrome del core; el quark la compone vía `buildToolbar()`
 * llenando `left` / `right`. El Shell la renderiza solo cuando el quark activo
 * aporta una toolbar.
 */
export function QuarkToolbar({ left, right }: QuarkToolbarProps) {
  return (
    <div
      style={{
        flex: "0 0 30px",
        height: 30,
        display: "flex",
        alignItems: "center",
        padding: "0 4px 0 12px",
        background: "var(--q-surface)",
        borderBottom: "1px solid var(--q-border)",
      }}
    >
      <div style={{ flex: 1, display: "flex", alignItems: "center", minWidth: 0, height: "100%" }}>
        {left}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 2 }}>
        {right}
      </div>
    </div>
  );
}
