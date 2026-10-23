import { memo, useRef, useState, type ReactNode } from "react";
import { Icon, isAndroid, MenuItem, MenuPanel, useMenu } from "@quarks/core";
import type { PlayOrder, Track } from "../types";
import { fmtTime, fractionAt, PLAY_ORDERS } from "../util";
import { PlayButton } from "./PlayButton";

export interface PlayerProps {
  track: Track | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;
  order: PlayOrder;
  loop: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (sec: number) => void;
  onSetOrder: (order: PlayOrder) => void;
  onToggleLoop: () => void;
  onSetVolume: (v: number) => void;
}

/** Barra de reproducción inferior. */
export const Player = memo(function Player({
  track,
  playing,
  positionSec,
  durationSec,
  volume,
  order,
  loop,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onSetOrder,
  onToggleLoop,
  onSetVolume,
}: PlayerProps) {
  if (!track) return null;
  const total = durationSec || 0;
  const pct = total > 0 ? Math.max(0, Math.min(1, positionSec / total)) : 0;

  const info = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <span
        style={{
          fontSize: isAndroid ? 13 : 12,
          fontWeight: 600,
          color: "var(--q-text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {track.title}
      </span>
      <span
        style={{
          fontSize: 11,
          color: "var(--q-text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {track.artist || "—"}
      </span>
    </div>
  );

  const time = (
    <span
      style={{
        fontSize: 10,
        color: "var(--q-text-light)",
        fontFamily: "var(--q-font-mono)",
        fontVariantNumeric: "tabular-nums",
        flex: "0 0 auto",
      }}
    >
      {fmtTime(positionSec)} / {fmtTime(total)}
    </span>
  );

  const transport = (
    <div style={{ display: "flex", alignItems: "center", gap: isAndroid ? 6 : 2 }}>
      <TransportButton name="skip_previous" onClick={onPrev} />
      <PlayButton playing={playing} onClick={onTogglePlay} />
      <TransportButton name="skip_next" onClick={onNext} />
    </div>
  );

  const modes = (
    <>
      <OrderButton order={order} onSelect={onSetOrder} />
      <ToggleButton name="repeat_one" tooltip="Repetir" selected={loop} onClick={onToggleLoop} />
    </>
  );

  const volumeControl = (
    <>
      <Icon name="volume_up" size={16} color="var(--q-text-light)" weight={350} />
      <VolumeBar value={volume} onChange={onSetVolume} />
    </>
  );

  // Mobile: dos filas (info + tiempo arriba, controles abajo). En una sola fila
  // el ancho de un celular no alcanza para transporte + modos + volumen.
  if (isAndroid) {
    return (
      <Bar>
        <SeekBar pct={pct} total={total} onSeek={onSeek} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
          {info}
          {time}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            marginTop: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 2, justifySelf: "start" }}>
            {modes}
          </div>
          {transport}
          <div style={{ display: "flex", alignItems: "center", gap: 2, justifySelf: "end" }}>
            {volumeControl}
          </div>
        </div>
      </Bar>
    );
  }

  return (
    <Bar>
      <SeekBar pct={pct} total={total} onSeek={onSeek} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
        {info}
        {transport}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 2,
          }}
        >
          {modes}
          <span style={{ margin: "0 8px 0 4px", display: "inline-flex" }}>{time}</span>
          {volumeControl}
        </div>
      </div>
    </Bar>
  );
});

/** Contenedor de la barra inferior. En mobile respira más (targets táctiles). */
function Bar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flex: "0 0 auto",
        background: "var(--q-background)",
        borderTop: "1px solid var(--q-border-light)",
        padding: isAndroid ? "6px 14px 12px" : "5px 14px 7px",
      }}
    >
      {children}
    </div>
  );
}

function SeekBar({ pct, total, onSeek }: { pct: number; total: number; onSeek: (s: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Mouse relativo al borde izquierdo de la barra + ancho de la barra, medidos
  // juntos sobre el mismo rect (`null` = sin hover).
  const [hover, setHover] = useState<{ x: number; w: number } | null>(null);
  // Posición en la barra bajo `clientX`, contra el rect de la barra (igual que
  // VolumeBar). No `offsetX`: ese es relativo al target, y sobre el knob daba
  // 0..10 px → seek a ~0 s.
  const at = (clientX: number) => {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, w: Math.max(1, rect.width) };
  };
  const tip = hover && total > 0 ? Math.max(0, Math.min(1, hover.x / hover.w)) * total : null;

  return (
    <div
      ref={ref}
      onMouseMove={(e) => setHover(at(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        if (total <= 0) return;
        const h = at(e.clientX);
        if (h) onSeek(Math.max(0, Math.min(1, h.x / h.w)) * total);
      }}
      style={{
        height: isAndroid ? 20 : 14,
        position: "relative",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div
        style={{
          height: isAndroid ? 4 : 3,
          width: "100%",
          background: "var(--q-surface-alt)",
          borderRadius: 9999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: pct * 100 + "%",
            background: "var(--q-primary-light)",
            borderRadius: 9999,
          }}
        />
      </div>
      {hover && (
        <>
          <div
            style={{
              position: "absolute",
              left: `calc(${pct * 100}% - 5px)`,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--q-primary-light)",
              pointerEvents: "none",
            }}
          />
          {tip != null && (
            <div
              style={{
                position: "absolute",
                top: -16,
                left: Math.max(0, Math.min(hover.w - 40, hover.x - 20)),
                background: "var(--q-surface-alt)",
                border: "1px solid var(--q-border)",
                borderRadius: 4,
                padding: "1px 4px",
                fontSize: 9,
                fontFamily: "var(--q-font-mono)",
                color: "var(--q-text-primary)",
                pointerEvents: "none",
              }}
            >
              {fmtTime(tip)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TransportButton({ name, onClick }: { name: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        width: isAndroid ? 40 : 30,
        height: isAndroid ? 40 : 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        color: hover ? "var(--q-text-primary)" : "var(--q-text-secondary)",
        transition: "color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={name} size={isAndroid ? 24 : 20} />
    </div>
  );
}

/**
 * Orden de reproducción: el ícono muestra el elegido (resaltado si no es "En
 * orden") y el click abre el menú hacia arriba. En mobile los modos van a la
 * izquierda de la barra, en desktop a la derecha: el menú se pega a ese borde.
 */
function OrderButton({ order, onSelect }: { order: PlayOrder; onSelect: (o: PlayOrder) => void }) {
  const menu = useMenu<HTMLDivElement>();
  const current = PLAY_ORDERS.find((o) => o.id === order) ?? PLAY_ORDERS[0];
  return (
    <div ref={menu.ref} style={{ position: "relative", display: "inline-flex" }}>
      <ToggleButton
        name={current.icon}
        tooltip={`Orden: ${current.label}`}
        selected={order !== "normal" || menu.open}
        onClick={() => menu.setOpen((o) => !o)}
      />
      {menu.open && (
        <MenuPanel up align={isAndroid ? "left" : "right"} minWidth={230}>
          {PLAY_ORDERS.map((o) => (
            <MenuItem
              key={o.id}
              icon={o.icon}
              label={o.label}
              checked={o.id === order}
              onClick={menu.run(() => onSelect(o.id))}
            />
          ))}
        </MenuPanel>
      )}
    </div>
  );
}

function ToggleButton({
  name,
  tooltip,
  selected,
  onClick,
}: {
  name: string;
  tooltip: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      title={tooltip}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: isAndroid ? 36 : 30,
        height: isAndroid ? 36 : 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        background:
          selected && hover
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
        transition: "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={name} size={isAndroid ? 18 : 16} weight={350} />
    </div>
  );
}

function VolumeBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    if (ref.current) onChange(fractionAt(ref.current, clientX));
  };
  return (
    <div
      ref={ref}
      onClick={(e) => seek(e.clientX)}
      style={{
        width: isAndroid ? 52 : 64,
        marginLeft: 6,
        height: isAndroid ? 20 : 14,
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <div style={{ height: 3, width: "100%", background: "var(--q-surface-alt)", borderRadius: 9999 }}>
        <div
          style={{
            height: "100%",
            width: value * 100 + "%",
            background: "var(--q-primary-light)",
            borderRadius: 9999,
          }}
        />
      </div>
    </div>
  );
}
