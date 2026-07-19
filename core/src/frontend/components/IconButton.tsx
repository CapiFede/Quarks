import { useState, type CSSProperties } from "react";
import { Icon } from "./Icon";

export interface IconButtonProps {
  name: string;
  tooltip?: string;
  selected?: boolean;
  onClick?: () => void;
  size?: number;
  style?: CSSProperties;
}

/** Botón de ícono 28×28 usado en las toolbars. */
export function IconButton({
  name,
  tooltip,
  selected,
  onClick,
  size = 15,
  style,
}: IconButtonProps) {
  const [hover, setHover] = useState(false);

  return (
    <span
      title={tooltip}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        background: selected
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: selected
          ? "var(--q-primary-light)"
          : hover
            ? "var(--q-text-primary)"
            : "var(--q-text-secondary)",
        cursor: "default",
        transition:
          "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
        ...style,
      }}
    >
      <Icon name={name} size={size} />
    </span>
  );
}
