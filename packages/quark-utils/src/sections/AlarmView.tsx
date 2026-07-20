import { useEffect, useState } from "react";
import { Button, IconButton, TextInput, Toggle } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { Alarm, AlarmKind, UtilsState } from "../types";

const SKIP_THRESHOLD_MS = 5 * 60 * 1000;

export interface AlarmViewProps {
  store: UtilsStore;
  state: UtilsState;
}

interface Draft {
  kind: AlarmKind;
  timeOfDay: string;
  intervalMin: number;
  label: string;
  sound: boolean;
}

const EMPTY_DRAFT: Draft = {
  kind: "once",
  timeOfDay: defaultTime(),
  intervalMin: 30,
  label: "",
  sound: true,
};

function defaultTime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function describe(a: Alarm): string {
  if (a.kind === "once" && a.timeOfDay) return `Hoy/mañana a las ${a.timeOfDay}`;
  if (a.kind === "interval" && a.intervalMs) {
    const min = Math.round(a.intervalMs / 60_000);
    return `Cada ${min} min`;
  }
  return "—";
}

/** Formatea ms restantes como "X min" / "<1 min" / "ahora". */
function fmtRemaining(ms: number): string {
  if (ms <= 0) return "ahora";
  if (ms < 60_000) return "<1 min";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function AlarmView({ store, state }: AlarmViewProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Reloj local solo para refrescar los countdowns; tick cada 5s (cuando la
  // vista está montada). El store no necesita meter `now` en su state.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const submit = () => {
    const base = {
      label: draft.label.trim(),
      enabled: true,
      sound: draft.sound,
    };
    if (draft.kind === "once") {
      store.addAlarm({ ...base, kind: "once", timeOfDay: draft.timeOfDay });
    } else {
      store.addAlarm({
        ...base,
        kind: "interval",
        intervalMs: Math.max(1, draft.intervalMin) * 60_000,
      });
    }
    setDraft(EMPTY_DRAFT);
    setAdding(false);
  };

  return (
    <div className="q-utils-stack">
      <div className="q-utils-section-title">
        <h2 className="q-utils-title" style={{ margin: 0 }}>Alarmas</h2>
        {!adding && (
          <Button icon="add" variant="filled" onClick={() => setAdding(true)}>
            Nueva
          </Button>
        )}
      </div>

      {adding && (
        <div className="q-utils-card">
          <div className="q-utils-row">
            <KindToggle
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind })}
            />
          </div>
          {draft.kind === "once" ? (
            <label className="q-utils-num">
              <span className="q-utils-num-label">Hora</span>
              <input
                type="time"
                value={draft.timeOfDay}
                onChange={(e) => setDraft({ ...draft, timeOfDay: e.target.value })}
              />
            </label>
          ) : (
            <label className="q-utils-num">
              <span className="q-utils-num-label">Cada (min)</span>
              <input
                type="number"
                min={1}
                value={draft.intervalMin}
                onChange={(e) =>
                  setDraft({ ...draft, intervalMin: parseInt(e.target.value || "1", 10) })
                }
              />
            </label>
          )}
          <TextInput
            value={draft.label}
            onChange={(v) => setDraft({ ...draft, label: v })}
            placeholder="Etiqueta (opcional)"
            icon="label"
          />
          <div className="q-utils-row" style={{ alignItems: "center", gap: 10 }}>
            <Toggle
              checked={draft.sound}
              onChange={(sound) => setDraft({ ...draft, sound })}
            />
            <span style={{ fontSize: 13, color: "var(--q-text-secondary)" }}>
              Sonido al disparar
            </span>
          </div>
          <div className="q-utils-row">
            <Button variant="filled" icon="check" onClick={submit}>
              Crear
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setDraft(EMPTY_DRAFT);
                setAdding(false);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="q-utils-list">
        {state.alarms.length === 0 && !adding && (
          <div className="q-utils-empty">Sin alarmas. Creá una para empezar.</div>
        )}
        {state.alarms.map((a) => {
          const next = state.alarmNext[a.id];
          const remaining = a.enabled && next ? next - now : null;
          const canSkip =
            a.enabled && remaining !== null && remaining > 0 && remaining <= SKIP_THRESHOLD_MS;
          return (
            <div key={a.id} className="q-utils-list-row">
              <div className="q-utils-list-main">
                <div className="q-utils-list-title">
                  {a.label || (a.kind === "once" ? "Alarma puntual" : "Alarma de intervalo")}
                </div>
                <div className="q-utils-list-sub">
                  {describe(a)}
                  {a.enabled && remaining !== null && (
                    <span className="q-utils-list-eta"> · en {fmtRemaining(remaining)}</span>
                  )}
                </div>
              </div>
              {canSkip && (
                <Button
                  variant="outlined"
                  icon="skip_next"
                  onClick={() => store.skipNextAlarm(a.id)}
                >
                  Skip
                </Button>
              )}
              <IconButton
                name="restart_alt"
                tooltip="Reiniciar"
                onClick={() => store.restartAlarm(a.id)}
              />
              <Toggle checked={a.enabled} onChange={() => store.toggleAlarm(a.id)} />
              <IconButton
                name="delete"
                tooltip="Borrar"
                onClick={() => store.removeAlarm(a.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KindToggle({
  value,
  onChange,
}: {
  value: AlarmKind;
  onChange: (k: AlarmKind) => void;
}) {
  return (
    <div className="q-utils-segmented">
      <button
        type="button"
        data-active={value === "once"}
        onClick={() => onChange("once")}
      >
        Hora del día
      </button>
      <button
        type="button"
        data-active={value === "interval"}
        onClick={() => onChange("interval")}
      >
        Intervalo
      </button>
    </div>
  );
}
