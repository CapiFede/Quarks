import { memo, useRef, useState } from "react";
import { Icon } from "@quarks/core";
import type { Track } from "../types";
import { fmtTime } from "../util";

export interface PlayerProps {
  track: Track | null;
  playing: boolean;
  positionSec: number;
  durationSec: number;
  volume: number;
  shuffle: boolean;
  loop: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (sec: number) => void;
  onToggleShuffle: () => void;
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
  shuffle,
  loop,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onToggleShuffle,
  onToggleLoop,
  onSetVolume,
}: PlayerProps) {
  if (!track) return null;
  const total = durationSec || 0;
  const pct = total > 0 ? Math.max(0, Math.min(1, positionSec / total)) : 0;

  return (
    <div
      style={{
        flex: "0 0 auto",
        background: "var(--q-background)",
        borderTop: "1px solid var(--q-border-light)",
        padding: "5px 14px 7px",
      }}
    >
      <SeekBar pct={pct} total={total} onSeek={onSeek} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--q-text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {track.title}
          </span>
          <span style={{ fontSize: 11, color: "var(--q-text-secondary)" }}>
            {track.artist || "—"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <TransportButton name="skip_previous" onClick={onPrev} />
          <PlayButton playing={playing} onClick={onTogglePlay} />
          <TransportButton name="skip_next" onClick={onNext} />
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 2,
          }}
        >
          <ToggleButton name="shuffle" tooltip="Aleatorio" selected={shuffle} onClick={onToggleShuffle} />
          <ToggleButton name="repeat_one" tooltip="Repetir" selected={loop} onClick={onToggleLoop} />
          <span
            style={{
              fontSize: 10,
              color: "var(--q-text-light)",
              fontFamily: "var(--q-font-mono)",
              fontVariantNumeric: "tabular-nums",
              margin: "0 8px 0 4px",
            }}
          >
            {fmtTime(positionSec)} / {fmtTime(total)}
          </span>
          <Icon name="volume_up" size={16} color="var(--q-text-light)" weight={350} />
          <VolumeBar value={volume} onChange={onSetVolume} />
        </div>
      </div>
    </div>
  );
});

function SeekBar({ pct, total, onSeek }: { pct: number; total: number; onSeek: (s: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const w = ref.current?.offsetWidth ?? 1;
  const tip = hoverX != null && total > 0 ? (hoverX / w) * total : null;

  return (
    <div
      ref={ref}
      onMouseMove={(e) => setHoverX(e.nativeEvent.offsetX)}
      onMouseLeave={() => setHoverX(null)}
      onClick={(e) => total > 0 && onSeek((e.nativeEvent.offsetX / w) * total)}
      style={{ height: 14, position: "relative", cursor: "pointer", display: "flex", alignItems: "center" }}
    >
      <div
        style={{
          height: 3,
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
      {hoverX != null && (
        <>
          <div
            style={{
              position: "absolute",
              left: `calc(${pct * 100}% - 5px)`,
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: "var(--q-primary-light)",
            }}
          />
          {tip != null && (
            <div
              style={{
                position: "absolute",
                top: -16,
                left: Math.max(0, Math.min(w - 40, hoverX - 20)),
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

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: hover ? "var(--q-primary)" : "var(--q-primary-light)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={playing ? "pause" : "play_arrow"} size={18} fill={1} weight={400} color="#fff" />
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
        width: 30,
        height: 30,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        color: hover ? "var(--q-text-primary)" : "var(--q-text-secondary)",
        transition: "color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={name} size={20} />
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
        width: 30,
        height: 30,
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
      <Icon name={name} size={16} weight={350} />
    </div>
  );
}

function VolumeBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const seek = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onChange(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };
  return (
    <div
      ref={ref}
      onClick={(e) => seek(e.clientX)}
      style={{ width: 64, marginLeft: 6, height: 14, display: "flex", alignItems: "center", cursor: "pointer" }}
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
