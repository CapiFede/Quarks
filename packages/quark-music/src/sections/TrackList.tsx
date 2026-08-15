import { memo, useEffect, useRef, useState } from "react";
import { Icon, isAndroid } from "@quarks/core";
import type { Track } from "../types";
import { fmtTime } from "../util";

const GRID = "32px 1fr 60px";

export interface TrackListProps {
  tracks: Track[];
  activePath: string | null;
  playing: boolean;
  onPlay: (path: string) => void;
  onSelect: (path: string) => void;
  selectedPath: string | null;
  /** Mensaje de vacío contextual (sin carpeta, sin resultados, etc.). */
  empty?: string;
}

/**
 * Lista de tracks (grid #/Título/Tiempo). `memo`: el tick de posición
 * del player no la re-renderiza (sus props no cambian en cada tick).
 */
export const TrackList = memo(function TrackList({
  tracks,
  activePath,
  playing,
  onPlay,
  onSelect,
  selectedPath,
  empty,
}: TrackListProps) {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        background: "var(--q-background)",
        // En mobile no hay panel a la derecha: el borde quedaría pegado al borde
        // de la pantalla.
        borderRight: isAndroid ? undefined : "1px solid var(--q-border)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID,
          padding: "8px 14px",
          borderBottom: "1px solid var(--q-border)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".4px",
          textTransform: "uppercase",
          color: "var(--q-text-secondary)",
          position: "sticky",
          top: 0,
          background: "var(--q-background)",
        }}
      >
        <span>#</span>
        <span>Título</span>
        <span style={{ textAlign: "right" }}>Tiempo</span>
      </div>

      {tracks.length === 0 ? (
        <div
          style={{
            padding: "40px 14px",
            textAlign: "center",
            color: "var(--q-text-light)",
            fontSize: 13,
          }}
        >
          {empty ?? "No hay tracks."}
        </div>
      ) : (
        tracks.map((t, i) => (
          <Row
            key={t.path}
            idx={i + 1}
            track={t}
            active={t.path === activePath}
            playing={playing}
            selected={t.path === selectedPath}
            onPlay={() => onPlay(t.path)}
            onSelect={() => onSelect(t.path)}
          />
        ))
      )}
    </div>
  );
});

interface RowProps {
  idx: number;
  track: Track;
  active: boolean;
  playing: boolean;
  selected: boolean;
  onPlay: () => void;
  onSelect: () => void;
}

function Row({ idx, track, active, playing, selected, onPlay, onSelect }: RowProps) {
  const [hover, setHover] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  // El scroll sigue al track que se está reproduciendo: cuando esta fila pasa a
  // ser la activa, se centra en la vista. `"center"` (en vez de `"nearest"`)
  // evita que quede pegada al borde inferior o tapada por el header sticky.
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  const color = active ? "var(--q-primary)" : "var(--q-text-primary)";
  const bg = active
    ? "var(--q-primary-soft-9)"
    : selected
      ? "var(--q-card-hover)"
      : hover
        ? "var(--q-card-hover)"
        : "transparent";

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      // Sin panel derecho en mobile, seleccionar no muestra nada: un toque
      // reproduce directo (el doble tap no existe como gesto acá).
      onClick={isAndroid ? onPlay : onSelect}
      onDoubleClick={onPlay}
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        padding: isAndroid ? "10px 14px" : "6px 14px",
        alignItems: "center",
        background: bg,
        fontSize: 12,
        color,
        cursor: "default",
        borderBottom: "1px solid rgba(67,70,76,.5)",
      }}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {hover || active ? (
          <Icon
            name={active && playing ? "volume_up" : "play_arrow"}
            size={14}
            color={color}
          />
        ) : (
          <span
            style={{
              color: "var(--q-text-light)",
              fontFamily: "var(--q-font-mono)",
              fontSize: 11,
            }}
          >
            {idx}
          </span>
        )}
      </span>
      <span
        style={{
          fontWeight: active ? 600 : 500,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingRight: 8,
        }}
      >
        {track.title}
      </span>
      <span
        style={{
          textAlign: "right",
          color: "var(--q-text-light)",
          fontFamily: "var(--q-font-mono)",
          fontSize: 11,
        }}
      >
        {fmtTime(track.durationSec)}
      </span>
    </div>
  );
}
