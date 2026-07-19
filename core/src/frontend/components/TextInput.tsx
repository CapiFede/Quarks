import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Icon } from "./Icon";

export interface TextInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  icon?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onBlur?: () => void;
  style?: CSSProperties;
}

/** Input de texto compacto — 32px, radio 8px, fill surface, halo de focus suave. */
export function TextInput({
  value,
  onChange,
  placeholder,
  icon,
  autoFocus,
  onKeyDown,
  onBlur,
  style,
}: TextInputProps) {
  const [focus, setFocus] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 32,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        background:
          focus || !hover ? "var(--q-surface)" : "var(--q-card-hover)",
        border: focus
          ? "1px solid var(--q-primary-light)"
          : "1px solid transparent",
        borderRadius: 8,
        boxShadow: focus ? "0 0 0 3px var(--q-primary-soft)" : "none",
        transition:
          "background var(--q-dur-fast) var(--q-ease), border-color var(--q-dur-fast) var(--q-ease), box-shadow var(--q-dur-fast) var(--q-ease)",
        ...style,
      }}
    >
      {icon && (
        <Icon
          name={icon}
          size={14}
          color="var(--q-text-light)"
          style={{ marginRight: 8 }}
        />
      )}
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          onBlur?.();
        }}
        style={{
          flex: 1,
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: "var(--q-font-sans)",
          fontSize: 13,
          color: "var(--q-text-primary)",
        }}
      />
    </div>
  );
}
