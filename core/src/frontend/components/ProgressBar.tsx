import type { ReactNode } from "react";

export interface ProgressBarProps {
  /** 0..1. Se ignora con `indeterminate`. */
  value: number;
  /** Sin total conocido: pista llena atenuada. */
  indeterminate?: boolean;
  /** Texto a la izquierda, arriba de la barra (p. ej. "Subiendo 3 / 10"). */
  label?: ReactNode;
  /** Texto a la derecha, arriba de la barra (archivo en curso, bytes…). */
  detail?: ReactNode;
}

/** Barra de progreso fina con una línea de texto opcional arriba. */
export function ProgressBar({ value, indeterminate = false, label, detail }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
      {(label !== undefined || detail !== undefined) && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
          <span style={{ color: "var(--q-text-secondary)", fontWeight: 500 }}>{label}</span>
          {detail !== undefined && (
            <span
              style={{
                color: "var(--q-text-light)",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {detail}
            </span>
          )}
        </div>
      )}
      <div
        style={{
          height: 6,
          borderRadius: 9999,
          background: "var(--q-surface-alt)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: indeterminate ? "100%" : `${pct}%`,
            background: "var(--q-primary)",
            opacity: indeterminate ? 0.4 : 1,
            transition: "width var(--q-dur-fast) var(--q-ease)",
          }}
        />
      </div>
    </div>
  );
}
