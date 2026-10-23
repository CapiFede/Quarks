import { Button, Icon, useStoreState } from "@quarks/core";
import type { UtilsStore } from "../store";
import { UtilsSidebar } from "./UtilsSidebar";
import { TimerView } from "./TimerView";
import { StopwatchView } from "./StopwatchView";
import { AlarmView } from "./AlarmView";
import { RandomView } from "./RandomView";
import "../styles/utils.css";

export interface UtilsPageProps {
  store: UtilsStore;
}

export function UtilsPage({ store }: UtilsPageProps) {
  const state = useStoreState(store);

  return (
    <div className="q-utils-page">
      <UtilsSidebar store={store} active={state.activeTool} />
      <div className="q-utils-panel">
        {state.activeTool === "clocks" && (
          <div className="q-utils-clocks">
            <div className="q-utils-col">
              <TimerView store={store} state={state} />
              <StopwatchView store={store} state={state} />
            </div>
            <div className="q-utils-col">
              <AlarmView store={store} state={state} />
            </div>
          </div>
        )}
        {state.activeTool === "random" && <RandomView store={store} state={state} />}
      </div>
      {state.firing && (
        <FiringOverlay
          label={state.firing.label}
          firedAt={state.firing.firedAt}
          onDismiss={() => store.dismissFiring()}
        />
      )}
    </div>
  );
}

function FiringOverlay({
  label,
  firedAt,
  onDismiss,
}: {
  label: string;
  firedAt: number;
  onDismiss: () => void;
}) {
  const d = new Date(firedAt);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return (
    <div className="q-utils-overlay" onClick={onDismiss}>
      <div className="q-utils-overlay-card" onClick={(e) => e.stopPropagation()}>
        <Icon name="alarm" size={36} color="var(--q-primary)" />
        <div className="q-utils-overlay-title">{label}</div>
        <div className="q-utils-overlay-sub">{time}</div>
        <Button variant="filled" icon="check" onClick={onDismiss}>
          OK
        </Button>
      </div>
    </div>
  );
}
