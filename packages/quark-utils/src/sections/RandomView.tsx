import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { UtilsState } from "../types";

/** Duración total de la ruleta de números antes de fijar el resultado. */
const ROLL_MS = 1500;
/** Duración del giro de la moneda (matchea la animación CSS del saltito). */
const FLIP_MS = 1200;

export interface RandomViewProps {
  store: UtilsStore;
  state: UtilsState;
}

export function RandomView({ store, state }: RandomViewProps) {
  const { randomMin, randomMax, random } = state;

  // ── Ruleta del número ──
  // Mientras rueda, el display muestra valores al azar del rango a intervalos
  // crecientes (arranca rápido y frena). Al cumplirse ROLL_MS el store genera
  // el número real y el display lo marca como final (color primario + pop).
  const [rollValue, setRollValue] = useState<number | null>(null);
  const rollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rolling = rollValue !== null;

  useEffect(
    () => () => {
      if (rollTimer.current) clearTimeout(rollTimer.current);
    },
    [],
  );

  const startRoll = () => {
    if (rolling) return;
    const lo = Math.min(randomMin, randomMax);
    const hi = Math.max(randomMin, randomMax);
    const startedAt = performance.now();
    const step = () => {
      const t = performance.now() - startedAt;
      if (t >= ROLL_MS) {
        rollTimer.current = null;
        setRollValue(null);
        store.generateRandom();
        return;
      }
      setRollValue(lo + Math.floor(Math.random() * (hi - lo + 1)));
      // Frenado: el intervalo entre saltos crece de ~60ms a ~250ms hacia el final.
      const delay = 60 + 190 * (t / ROLL_MS) ** 2;
      rollTimer.current = setTimeout(step, delay);
    };
    step();
  };

  // ── Moneda ──
  // El store decide el resultado al instante; el giro se anima por JS con el
  // truco 2D de siempre: scaleX(|cos θ|) aplasta la moneda y el ícono cambia
  // según qué hemisferio mira al frente. Nada de 3D real — backface-visibility
  // no anda confiable en WebKitGTK y se veían las dos caras superpuestas.
  // El ángulo arranca en la cara actual y termina (tras 5 vueltas, con frenado)
  // en la del resultado.
  const [coinAngle, setCoinAngle] = useState<number | null>(null);
  const coinRaf = useRef<number | null>(null);
  const flipping = coinAngle !== null;

  useEffect(
    () => () => {
      if (coinRaf.current !== null) cancelAnimationFrame(coinRaf.current);
    },
    [],
  );

  const flip = () => {
    if (flipping) return;
    const faceAngle = (coin: string | null) => (coin === "Cruz" ? 180 : 0);
    const start = faceAngle(store.getSnapshot().random.lastCoin);
    store.flipCoin();
    const end = 5 * 360 + faceAngle(store.getSnapshot().random.lastCoin);
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / FLIP_MS);
      if (t >= 1) {
        coinRaf.current = null;
        setCoinAngle(null);
        return;
      }
      const eased = 1 - (1 - t) ** 3;
      setCoinAngle(start + (end - start) * eased);
      coinRaf.current = requestAnimationFrame(tick);
    };
    coinRaf.current = requestAnimationFrame(tick);
  };

  // Cara visible y aplastamiento horizontal del frame actual.
  const restFace = random.lastCoin === "Cruz" ? "cruz" : "cara";
  let shownFace = restFace;
  let squash = 1;
  if (coinAngle !== null) {
    const cos = Math.cos((coinAngle * Math.PI) / 180);
    shownFace = cos >= 0 ? "cara" : "cruz";
    squash = Math.max(0.06, Math.abs(cos));
  }

  return (
    <div className="q-utils-stack q-utils-random">
      <h2 className="q-utils-title">Random</h2>

      <div className="q-utils-random-grid">
        <div className="q-utils-section">
          <div className="q-utils-section-title">
            <span>Número</span>
          </div>
          <div className="q-utils-row">
            <RangeInput
              label="Min"
              value={randomMin}
              onChange={(v) => store.setRandomRange(v, randomMax)}
            />
            <RangeInput
              label="Max"
              value={randomMax}
              onChange={(v) => store.setRandomRange(randomMin, v)}
            />
            <Button
              variant="filled"
              icon="casino"
              disabled={rolling}
              onClick={startRoll}
            >
              Generar
            </Button>
          </div>
          <div
            className="q-utils-display q-utils-roll"
            data-final={!rolling && random.lastNumber !== null}
          >
            {rolling ? (
              <span>{rollValue}</span>
            ) : random.lastNumber !== null ? (
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
            <span>Moneda</span>
          </div>
          <div className="q-utils-coin-area">
            <div className={`q-utils-coin-scene${flipping ? " q-utils-coin-tossing" : ""}`}>
              <div className="q-utils-coin" style={{ transform: `scaleX(${squash})` }}>
                <Icon
                  name={shownFace === "cara" ? "sentiment_satisfied" : "add"}
                  size={56}
                />
              </div>
            </div>
            <Button variant="filled" icon="paid" disabled={flipping} onClick={flip}>
              Tirar moneda
            </Button>
            <div className="q-utils-coin-result" data-visible={!flipping && random.lastCoin !== null}>
              {random.lastCoin ?? "—"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Input numérico simple: selecciona todo el contenido al enfocar, así tipear
 * un dígito reemplaza el valor en vez de concatenarlo (el "2" → "23" de antes).
 */
function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="q-utils-num">
      <span className="q-utils-num-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
      />
    </label>
  );
}
