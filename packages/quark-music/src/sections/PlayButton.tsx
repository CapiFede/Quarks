import { useState } from "react";
import { Icon, isAndroid } from "@quarks/core";

/** Botón redondo de play/pausa (player y preview del recorte). */
export function PlayButton({
  playing,
  onClick,
  size = isAndroid ? 44 : 32,
}: {
  playing: boolean;
  onClick: () => void;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: hover ? "var(--q-primary)" : "var(--q-primary-light)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        flex: "0 0 auto",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon
        name={playing ? "pause" : "play_arrow"}
        size={size >= 40 ? 24 : 18}
        fill={1}
        weight={400}
        color="#fff"
      />
    </span>
  );
}
