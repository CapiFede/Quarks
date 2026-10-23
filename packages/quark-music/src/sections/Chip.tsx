import { useState } from "react";
import { Icon } from "@quarks/core";

/**
 * Chip de selección (playlist destino, categoría, pertenencia). Activo = tinte
 * primario con tilde; inactivo = gris con "+" salvo que `addIcon` sea false.
 */
export function Chip({
  label,
  active,
  addIcon = true,
  onClick,
}: {
  label: string;
  active: boolean;
  addIcon?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        height: 24,
        fontSize: 11,
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
      {active ? <Icon name="check" size={13} /> : addIcon && <Icon name="add" size={13} />}
      {label}
    </span>
  );
}
