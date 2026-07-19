import type { CSSProperties } from "react";

export interface IconProps {
  /** Nombre de la ligatura de Material Symbols Outlined (ej: "play_arrow"). */
  name: string;
  size?: number;
  weight?: number;
  fill?: 0 | 1;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

/** Wrapper de Material Symbols Outlined. */
export function Icon({
  name,
  size = 16,
  weight = 350,
  fill = 0,
  color,
  className = "",
  style,
}: IconProps) {
  return (
    <span
      className={"material-symbols-outlined " + className}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
        color: color ?? "inherit",
        userSelect: "none",
        lineHeight: 1,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
