import { useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ButtonVariant =
  | "filled"
  | "outlined"
  | "soft"
  | "text"
  | "destructive";

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  icon?: string;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

/** Botón cuadrado con variantes filled / outlined / soft / text / destructive. */
export function Button({
  children,
  variant = "outlined",
  icon,
  disabled,
  onClick,
  style,
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const showHover = hover && !disabled;

  const base: CSSProperties = {
    fontFamily: "var(--q-font-sans)",
    fontSize: 13,
    border: "none",
    borderRadius: 8,
    cursor: "default",
    padding: "0 14px",
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: 1,
    transition:
      "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease), border-color var(--q-dur-fast) var(--q-ease)",
  };

  const variants: Record<ButtonVariant, CSSProperties> = {
    filled: {
      background: showHover ? "var(--q-primary-dark)" : "var(--q-primary)",
      color: "#fff",
      fontWeight: 600,
    },
    outlined: {
      background: showHover ? "var(--q-surface)" : "transparent",
      color: "var(--q-text-primary)",
      border: hover
        ? "1px solid var(--q-text-light)"
        : "1px solid var(--q-border-light)",
      fontWeight: 500,
    },
    soft: {
      background: "var(--q-primary-soft)",
      color: "var(--q-primary-light)",
      fontWeight: 500,
      filter: showHover ? "brightness(1.1)" : "none",
    },
    text: {
      background: showHover ? "var(--q-surface)" : "transparent",
      color: "var(--q-text-primary)",
      fontWeight: 500,
      height: 28,
      padding: "0 10px",
    },
    destructive: {
      background: showHover ? "rgba(227, 181, 181, 0.08)" : "transparent",
      color: "var(--q-error)",
      border: hover
        ? "1px solid var(--q-error)"
        : "1px solid var(--q-border-light)",
      fontWeight: 500,
    },
  };

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...base,
        ...variants[variant],
        ...(disabled ? { opacity: 0.45, cursor: "default" } : null),
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}
