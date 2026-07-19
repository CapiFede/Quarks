import { Button } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { UtilsState } from "../types";

export interface StopwatchViewProps {
  store: UtilsStore;
  state: UtilsState;
}

function fmtMs(ms: number): string {
  const total = Math.floor(ms);
  const cs = Math.floor((total % 1000) / 10); // centésimas
  const s = Math.floor(total / 1000) % 60;
  const m = Math.floor(total / 60_000) % 60;
  const h = Math.floor(total / 3_600_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}.${pad(cs)}` : `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export function StopwatchView({ store, state }: StopwatchViewProps) {
  const sw = state.stopwatch;

  return (
    <div className="q-utils-stack">
      <h2 className="q-utils-title">Cronómetro</h2>

      <div className="q-utils-display">{fmtMs(sw.elapsedMs)}</div>

      <div className="q-utils-row">
        {sw.status === "running" ? (
          <Button variant="outlined" icon="pause" onClick={() => store.pauseStopwatch()}>
            Pause
          </Button>
        ) : (
          <Button variant="filled" icon="play_arrow" onClick={() => store.startStopwatch()}>
            {sw.status === "paused" ? "Resume" : "Start"}
          </Button>
        )}
        <Button
          variant="outlined"
          icon="flag"
          onClick={() => store.lapStopwatch()}
          disabled={sw.status === "idle"}
        >
          Lap
        </Button>
        <Button
          variant="outlined"
          icon="restart_alt"
          onClick={() => store.resetStopwatch()}
          disabled={sw.elapsedMs === 0 && sw.laps.length === 0}
        >
          Reset
        </Button>
      </div>

      {sw.laps.length > 0 && (
        <div className="q-utils-section">
          <div className="q-utils-section-title">
            <span>Laps</span>
          </div>
          <div className="q-utils-laps">
            {sw.laps.map((t, i) => {
              const prev = i === 0 ? 0 : sw.laps[i - 1];
              return (
                <div key={i} className="q-utils-lap-row">
                  <span className="q-utils-lap-idx">#{sw.laps.length - i}</span>
                  <span className="q-utils-lap-delta">+{fmtMs(t - prev)}</span>
                  <span className="q-utils-lap-total">{fmtMs(t)}</span>
                </div>
              );
            }).reverse()}
          </div>
        </div>
      )}
    </div>
  );
}
