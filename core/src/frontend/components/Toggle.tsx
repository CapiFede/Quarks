import type { CSSProperties } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  style?: CSSProperties;
}

/** Switch on/off. Pista que se tiñe de primary al activarse; knob deslizante. */
export function Toggle({ checked, onChange, disabled, style }: ToggleProps) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        position: "relative",
        flex: "0 0 auto",
        width: 34,
        height: 20,
        borderRadius: 9999,
        background: checked ? "var(--q-primary)" : "var(--q-surface-alt)",
        opacity: disabled ? 0.5 : 1,
        cursor: "default",
        transition: "background var(--q-dur-fast) var(--q-ease)",
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: "#fff",
          transition: "left var(--q-dur-fast) var(--q-ease)",
        }}
      />
    </span>
  );
}
