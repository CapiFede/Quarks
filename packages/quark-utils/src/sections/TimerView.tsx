import { useEffect, useState } from "react";
import { Button, Icon, IconButton } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { TimerPreset, UtilsState } from "../types";

export interface TimerViewProps {
  store: UtilsStore;
  state: UtilsState;
}

/** Formato HH:MM:SS a partir de ms (HH se oculta si es 0). */
function fmt(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

interface Parts {
  h: number;
  m: number;
  s: number;
}

function partsFromMs(ms: number): Parts {
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

function msFromParts(p: Parts): number {
  return (p.h * 3600 + p.m * 60 + p.s) * 1000;
}

export function TimerView({ store, state }: TimerViewProps) {
  const timer = state.timer;
  const editable = timer.status === "idle" || timer.status === "done";

  // Inputs locales para que el usuario pueda tipear sin que el render externo lo pise.
  const initial = partsFromMs(timer.durationMs);
  const [h, setH] = useState(initial.h);
  const [m, setM] = useState(initial.m);
  const [s, setS] = useState(initial.s);

  // Si el timer cambia desde afuera (preset), reflejarlo en los inputs cuando esté idle.
  useEffect(() => {
    if (editable) {
      const p = partsFromMs(timer.durationMs);
      setH(p.h);
      setM(p.m);
      setS(p.s);
    }
  }, [editable, timer.durationMs]);

  const applyParts = (next: Parts) => {
    const clamped: Parts = {
      h: Math.max(0, Math.min(99, next.h | 0)),
      m: Math.max(0, Math.min(59, next.m | 0)),
      s: Math.max(0, Math.min(59, next.s | 0)),
    };
    setH(clamped.h);
    setM(clamped.m);
    setS(clamped.s);
    store.setTimerDuration(msFromParts(clamped));
  };

  const onApplyPreset = (p: TimerPreset) => {
    store.setTimerDuration(p.ms);
  };

  const onSaveCurrentAsPreset = () => {
    const ms = msFromParts({ h, m, s });
    if (ms < 1000) return;
    store.addTimerPreset(fmt(ms), ms);
  };

  return (
    <div className="q-utils-stack">
      <h2 className="q-utils-title">Temporizador</h2>

      <div className="q-utils-display" data-state={timer.status}>
        {timer.status === "done" ? "¡Listo!" : fmt(timer.remainingMs)}
      </div>

      {editable && (
        <div className="q-utils-time-input">
          <NumField label="Horas" value={h} onChange={(v) => applyParts({ h: v, m, s })} max={99} />
          <span className="q-utils-time-sep">:</span>
          <NumField label="Min" value={m} onChange={(v) => applyParts({ h, m: v, s })} max={59} />
          <span className="q-utils-time-sep">:</span>
          <NumField label="Seg" value={s} onChange={(v) => applyParts({ h, m, s: v })} max={59} />
        </div>
      )}

      <div className="q-utils-row">
        {timer.status === "idle" || timer.status === "done" ? (
          <Button
            variant="filled"
            icon="play_arrow"
            onClick={() => store.startTimer()}
            disabled={timer.durationMs <= 0}
          >
            Start
          </Button>
        ) : null}
        {timer.status === "running" && (
          <Button variant="outlined" icon="pause" onClick={() => store.pauseTimer()}>
            Pause
          </Button>
        )}
        {timer.status === "paused" && (
          <Button variant="filled" icon="play_arrow" onClick={() => store.resumeTimer()}>
            Resume
          </Button>
        )}
        {(timer.status === "paused" || timer.status === "running") && (
          <Button variant="outlined" icon="stop" onClick={() => store.resetTimer()}>
            Reset
          </Button>
        )}
        {timer.status === "done" && (
          <Button variant="outlined" icon="check" onClick={() => store.acknowledgeTimer()}>
            Listo
          </Button>
        )}
      </div>

      <div className="q-utils-section">
        <div className="q-utils-section-title" style={{ justifyContent: "flex-start", gap: 6 }}>
          <span>Presets</span>
          <IconButton
            name="add"
            tooltip="Guardar tiempo actual como preset"
            onClick={onSaveCurrentAsPreset}
          />
        </div>
        <div className="q-utils-chips">
          {state.timerPresets.length === 0 && (
            <span className="q-utils-empty">Sin presets. Tipea un tiempo y tocá +.</span>
          )}
          {state.timerPresets.map((p) => (
            <div key={p.id} className="q-utils-chip">
              <span onClick={() => onApplyPreset(p)} className="q-utils-chip-label">
                {p.label}
              </span>
              <span
                className="q-utils-chip-x"
                onClick={() => store.removeTimerPreset(p.id)}
                title="Eliminar"
              >
                <Icon name="close" size={12} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
}) {
  return (
    <label className="q-utils-num">
      <span className="q-utils-num-label">{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
      />
    </label>
  );
}
