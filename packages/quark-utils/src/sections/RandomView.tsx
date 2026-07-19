import { Button } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { UtilsState } from "../types";

export interface RandomViewProps {
  store: UtilsStore;
  state: UtilsState;
}

export function RandomView({ store, state }: RandomViewProps) {
  const { randomMin, randomMax, random } = state;

  return (
    <div className="q-utils-stack">
      <h2 className="q-utils-title">Random</h2>

      <div className="q-utils-section">
        <div className="q-utils-section-title">
          <span>Rango</span>
        </div>
        <div className="q-utils-row">
          <label className="q-utils-num">
            <span className="q-utils-num-label">Min</span>
            <input
              type="number"
              value={randomMin}
              onChange={(e) =>
                store.setRandomRange(parseInt(e.target.value || "0", 10), randomMax)
              }
            />
          </label>
          <label className="q-utils-num">
            <span className="q-utils-num-label">Max</span>
            <input
              type="number"
              value={randomMax}
              onChange={(e) =>
                store.setRandomRange(randomMin, parseInt(e.target.value || "0", 10))
              }
            />
          </label>
          <Button variant="filled" icon="casino" onClick={() => store.generateRandom()}>
            Generar
          </Button>
        </div>
        <div className="q-utils-display q-utils-display-sm">
          {random.lastNumber !== null ? (
            <span key={random.numberNonce} className="q-utils-pop">
              {random.lastNumber}
            </span>
          ) : (
            "—"
          )}
        </div>
      </div>

      <div className="q-utils-section">
        <div className="q-utils-section-title">
          <span>Coin</span>
        </div>
        <div className="q-utils-row">
          <Button variant="filled" icon="paid" onClick={() => store.flipCoin()}>
            Tirar moneda (50/50)
          </Button>
        </div>
        <div className="q-utils-display q-utils-display-sm">
          {random.lastCoin ? (
            <span key={random.coinNonce} className="q-utils-flip">
              {random.lastCoin}
            </span>
          ) : (
            "—"
          )}
        </div>
      </div>
    </div>
  );
}
