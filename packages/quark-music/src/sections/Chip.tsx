import { useState } from "react";
import { Icon } from "@quarks/core";

/**
 * Chip de selección (playlist destino, categoría, pertenencia). Activo = tinte
 * primario con tilde; inactivo = gris con "+" salvo que `addIcon` sea false.
 * Si no entra en su contenedor, se achica y corta el nombre con "…"
 * (`data-chip-label`, para medir si quedó cortado).
 */
export function Chip({
  label,
  active,
  addIcon = true,
  compact = false,
  onClick,
}: {
  label: string;
  active: boolean;
  addIcon?: boolean;
  /** Letra y márgenes un poco más chicos, para que entre en una fila apretada. */
  compact?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const iconSize = compact ? 12 : 13;
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 3 : 4,
        minWidth: 0,
        maxWidth: "100%",
        padding: compact ? "2px 6px" : "2px 8px",
        height: 24,
        fontSize: compact ? 10 : 11,
        fontWeight: 500,
        borderRadius: 6,
        cursor: "default",
        background: active
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "var(--q-surface-alt)",
        color: active ? "var(--q-primary-light)" : "var(--q-text-secondary)",
        transition:
          "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      {active ? (
        <Icon name="check" size={iconSize} style={{ flexShrink: 0 }} />
      ) : (
        addIcon && <Icon name="add" size={iconSize} style={{ flexShrink: 0 }} />
      )}
      <span
        data-chip-label=""
        style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
    </span>
  );
}
