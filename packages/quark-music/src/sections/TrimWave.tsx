import { useEffect, useRef, useState } from "react";
import { IconButton } from "@quarks/core";
import type { WavePeaks } from "../services/trim";
import { fmtFine, fmtScaled } from "../util";

export interface TrimWaveProps {
  /** Duración del archivo (segundos) — el dominio de toda la vista. */
  durationSec: number;
  /** Picos del waveform, o null si no se pudo decodificar (se ve solo la línea). */
  peaks: WavePeaks | null;
  /** Rango a conservar. */
  startSec: number;
  endSec: number;
  positionSec: number;
  playing: boolean;
  /** Arrastre de una manija (el store clampea y garantiza el largo mínimo). */
  onTrimStart: (sec: number) => void;
  onTrimEnd: (sec: number) => void;
  /** Click/arrastre sobre la onda (el store clampea al rango). */
  onSeek: (sec: number) => void;
}

const TRACK_H = 96;
const MINIMAP_H = 14;
const EPS = 0.001;
/** Máximo zoom: ~milisegundo por pixel (= `BASE_RATE` de los picos). */
const MAX_PPS = 2000;
/** Tolerancia (px) para agarrar una manija. */
const EDGE_PX = 6;

/**
 * Waveform del archivo ENTERO con dos manijas para recortar inicio y fin. Lo
 * que queda afuera del rango se ve atenuado. Click/arrastre sobre la onda =
 * playhead (seek/scrub); rueda = paneo; Ctrl+rueda = zoom (hasta milisegundos,
 * gracias a los picos multi-resolución); minimapa abajo para ubicarse.
 */
export function TrimWave({
  durationSec,
  peaks,
  startSec,
  endSec,
  positionSec,
  playing,
  onTrimStart,
  onTrimEnd,
  onSeek,
}: TrimWaveProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<null | "start" | "end" | "scrub">(null);

  const [width, setWidth] = useState(0);
  /** Pixeles por segundo (zoom). 0 = aún sin medir; equivale a "ver todo". */
  const [pps, setPps] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [hoverEdge, setHoverEdge] = useState(false);

  const total = Math.max(durationSec, 0.001);
  const fitPps = width > 0 ? width / total : 0;
  const effPps = pps > 0 ? Math.max(pps, fitPps) : fitPps;
  const viewDur = effPps > 0 ? width / effPps : total;

  // Refs con el estado vivo para el listener nativo de `wheel` (evita stale).
  const live = useRef({ effPps, viewStart, total, width, fitPps });
  live.current = { effPps, viewStart, total, width, fitPps };

  // Ancho real del track.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const clampStart = (s: number, dur: number) =>
    Math.max(0, Math.min(s, Math.max(0, total - dur)));

  /** Zoom manteniendo `anchorT` fijo en su pixel. */
  const zoomAround = (nextPps: number, anchorT: number) => {
    const np = Math.max(fitPps, Math.min(MAX_PPS, nextPps));
    const x = (anchorT - viewStart) * effPps;
    const nDur = width / np;
    setPps(np);
    setViewStart(clampStart(anchorT - x / np, nDur));
  };

  // Listener nativo de rueda (non-passive para poder preventDefault).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { effPps: ep, viewStart: vs, total: tot, width: w, fitPps: fit } = live.current;
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // Zoom manteniendo el tiempo bajo el cursor fijo en su pixel.
        const cursorT = vs + (e.clientX - rect.left) / ep;
        const np = Math.max(fit, Math.min(MAX_PPS, ep * Math.exp(-e.deltaY * 0.0015)));
        const x = (cursorT - vs) * ep;
        const nDur = w / np;
        setPps(np);
        setViewStart(Math.max(0, Math.min(cursorT - x / np, Math.max(0, tot - nDur))));
      } else {
        const delta = (e.deltaX || e.deltaY) / ep;
        const dur = w / ep;
        setViewStart(Math.max(0, Math.min(vs + delta, Math.max(0, tot - dur))));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Redibujar el waveform de la ventana visible.
  useEffect(() => {
    drawWaveform(canvasRef.current, peaks, startSec, endSec, viewStart, viewDur, width, TRACK_H);
  }, [peaks, startSec, endSec, viewStart, viewDur, width]);

  // Seguir el playhead durante la reproducción si se sale de la ventana.
  useEffect(() => {
    if (!playing || dragging.current) return;
    if (positionSec < viewStart || positionSec > viewStart + viewDur) {
      setViewStart(clampStart(positionSec - viewDur * 0.15, viewDur));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSec]);

  const pxAt = (clientX: number): number => {
    const el = wrapRef.current;
    return el ? clientX - el.getBoundingClientRect().left : -1;
  };
  const timeAt = (clientX: number): number =>
    Math.max(0, Math.min(total, viewStart + pxAt(clientX) / effPps));
  const xOf = (t: number) => (t - viewStart) * effPps;
  const inView = (t: number) => t >= viewStart - EPS && t <= viewStart + viewDur + EPS;

  /** Manija bajo el pixel, o null. Con las dos juntas gana la más cercana. */
  const edgeAtX = (clientX: number): "start" | "end" | null => {
    const px = pxAt(clientX);
    if (px < 0) return null;
    const dStart = inView(startSec) ? Math.abs(px - xOf(startSec)) : Infinity;
    const dEnd = inView(endSec) ? Math.abs(px - xOf(endSec)) : Infinity;
    if (Math.min(dStart, dEnd) > EDGE_PX) return null;
    return dStart <= dEnd ? "start" : "end";
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Capturar el puntero: el arrastre sigue aunque el mouse salga del track.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const edge = edgeAtX(e.clientX);
    if (edge) {
      dragging.current = edge;
      return;
    }
    dragging.current = "scrub";
    onSeek(timeAt(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const t = timeAt(e.clientX);
    setHoverT(t);
    const kind = dragging.current;
    if (kind === "start") {
      onTrimStart(t);
      return;
    }
    if (kind === "end") {
      onTrimEnd(t);
      return;
    }
    if (kind === "scrub") {
      onSeek(t);
      return;
    }
    setHoverEdge(edgeAtX(e.clientX) != null);
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  const zoomedIn = effPps > fitPps * 1.01;
  const shade = "rgba(0,0,0,.30)";

  return (
    <div style={{ flex: "0 0 auto" }}>
      <Ruler viewStart={viewStart} viewDur={viewDur} width={width} />

      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragging.current) {
            setHoverT(null);
            setHoverEdge(false);
          }
        }}
        style={{
          position: "relative",
          height: TRACK_H,
          borderRadius: 8,
          background: "var(--q-surface-alt)",
          border: "1px solid var(--q-border)",
          overflow: "hidden",
          cursor: hoverEdge || dragging.current === "start" || dragging.current === "end"
            ? "col-resize"
            : "pointer",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        />

        {!peaks && (
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 1, background: "var(--q-border)" }} />
        )}

        {/* Sombra sobre lo descartado (antes del inicio / después del fin). */}
        {startSec > EPS && xOf(startSec) > 0 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: Math.min(xOf(startSec), width),
              background: shade,
              pointerEvents: "none",
            }}
          />
        )}
        {endSec < total - EPS && xOf(endSec) < width && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: Math.max(xOf(endSec), 0),
              right: 0,
              background: shade,
              pointerEvents: "none",
            }}
          />
        )}

        {/* Manijas de recorte. */}
        {inView(startSec) && <Handle x={xOf(startSec)} side="start" />}
        {inView(endSec) && <Handle x={xOf(endSec)} side="end" />}

        {hoverT != null && !dragging.current && inView(hoverT) && (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: xOf(hoverT), width: 1, background: "var(--q-border-light)", pointerEvents: "none" }} />
        )}

        {inView(positionSec) && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: xOf(positionSec),
              width: 2,
              marginLeft: -1,
              background: "var(--q-text-primary)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>

      {/* Readout + controles de zoom. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 5,
          fontSize: 11,
          fontFamily: "var(--q-font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--q-text-light)",
        }}
      >
        <span style={{ minWidth: 64 }}>{fmtFine(positionSec)}</span>
        <span style={{ flex: 1, textAlign: "center", opacity: 0.7 }}>
          arrastrá las manijas para recortar · Ctrl+rueda zoom · rueda paneo
        </span>
        <IconButton name="zoom_out" tooltip="Alejar" size={14} onClick={() => zoomAround(effPps / 1.6, viewStart + viewDur / 2)} />
        <IconButton name="fit_screen" tooltip="Ver todo" size={14} onClick={() => { setPps(0); setViewStart(0); }} />
        <IconButton name="zoom_in" tooltip="Acercar" size={14} onClick={() => zoomAround(effPps * 1.6, viewStart + viewDur / 2)} />
      </div>

      {/* Minimapa: el archivo entero con el rango conservado y la ventana visible. */}
      {zoomedIn && (
        <Minimap
          total={total}
          startSec={startSec}
          endSec={endSec}
          viewStart={viewStart}
          viewDur={viewDur}
          onScrub={(centerT) => setViewStart(clampStart(centerT - viewDur / 2, viewDur))}
        />
      )}
    </div>
  );
}

/** Manija de recorte: línea vertical con grip, no intercepta el puntero (la
 *  detección es por cercanía en los handlers del track). */
function Handle({ x, side }: { x: number; side: "start" | "end" }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: x,
        width: 0,
        borderLeft: "2px solid var(--q-primary-light)",
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 0,
          left: side === "start" ? 0 : -8,
          width: 8,
          height: 12,
          background: "var(--q-primary-light)",
          borderRadius: side === "start" ? "0 0 4px 0" : "0 0 0 4px",
        }}
      />
    </div>
  );
}

/** Regla con marcas adaptadas al zoom (segundos o milisegundos). */
function Ruler({ viewStart, viewDur, width }: { viewStart: number; viewDur: number; width: number }) {
  if (width <= 0 || viewDur <= 0) return <div style={{ height: 16 }} />;
  const pps = width / viewDur;
  const step = tickStep(pps);
  const first = Math.ceil(viewStart / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= viewStart + viewDur + EPS; t += step) ticks.push(t);

  return (
    <div style={{ position: "relative", height: 16, overflow: "hidden" }}>
      {ticks.map((t) => (
        <div
          key={Math.round(t * 1000)}
          style={{
            position: "absolute",
            left: `${((t - viewStart) / viewDur) * 100}%`,
            bottom: 0,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 9, fontFamily: "var(--q-font-mono)", color: "var(--q-text-light)", lineHeight: 1.1, whiteSpace: "nowrap" }}>
            {fmtScaled(t, step)}
          </span>
          <span style={{ width: 1, height: 4, background: "var(--q-border)" }} />
        </div>
      ))}
    </div>
  );
}

/** Minimapa del archivo entero: rango conservado + ventana visible, arrastrable. */
function Minimap({
  total,
  startSec,
  endSec,
  viewStart,
  viewDur,
  onScrub,
}: {
  total: number;
  startSec: number;
  endSec: number;
  viewStart: number;
  viewDur: number;
  onScrub: (centerT: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef(false);

  const scrub = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onScrub(Math.max(0, Math.min(total, ((clientX - rect.left) / rect.width) * total)));
  };

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = true;
        scrub(e.clientX);
      }}
      onPointerMove={(e) => drag.current && scrub(e.clientX)}
      onPointerUp={(e) => {
        drag.current = false;
        e.currentTarget.releasePointerCapture?.(e.pointerId);
      }}
      style={{
        position: "relative",
        height: MINIMAP_H,
        marginTop: 5,
        borderRadius: 4,
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border)",
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${(startSec / total) * 100}%`,
          width: `${((endSec - startSec) / total) * 100}%`,
          background: "var(--q-primary-soft)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${(viewStart / total) * 100}%`,
          width: `${(viewDur / total) * 100}%`,
          background: "rgba(255,255,255,.10)",
          border: "1px solid var(--q-text-secondary)",
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/** Intervalo de marcas para ~80px de separación, hasta milisegundos. */
function tickStep(pps: number): number {
  const minSec = 80 / pps;
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((s) => s >= minSec) ?? 3600;
}

/**
 * Dibuja el waveform de la ventana visible. Trabaja a resolución de pixel
 * FÍSICO y elige el nivel de la pirámide según el zoom (cada columna agrega los
 * min/max de sus buckets → nítido en cualquier zoom). Lo que queda afuera del
 * rango [startSec, endSec] se pinta atenuado.
 */
function drawWaveform(
  canvas: HTMLCanvasElement | null,
  peaks: WavePeaks | null,
  startSec: number,
  endSec: number,
  viewStart: number,
  viewDur: number,
  cssWidth: number,
  cssHeight: number,
) {
  if (!canvas || cssWidth <= 0 || viewDur <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = Math.floor(cssWidth * dpr);
  const h = Math.floor(cssHeight * dpr);
  canvas.width = w;
  canvas.height = h;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!peaks || peaks.levels.length === 0) return;

  const color = getComputedStyle(canvas).getPropertyValue("--q-primary-light").trim() || "#6ea8fe";
  ctx.fillStyle = color;
  const mid = h / 2;
  const half = (h * 0.86) / 2;

  // Nivel más fino con ≤4 buckets por pixel (van ordenados de fino a grueso).
  const pps = w / viewDur;
  let lvl = peaks.levels[peaks.levels.length - 1];
  for (const L of peaks.levels) {
    if (L.rate / pps <= 4) {
      lvl = L;
      break;
    }
  }
  const n = lvl.min.length;

  let dimmed = false;
  for (let x = 0; x < w; x++) {
    const t = viewStart + (x / w) * viewDur;
    let i0 = Math.floor(t * lvl.rate);
    let i1 = Math.ceil((t + viewDur / w) * lvl.rate);
    i0 = Math.max(0, Math.min(n - 1, i0));
    i1 = Math.max(i0 + 1, Math.min(n, i1));
    let lo = 127;
    let hi = -127;
    for (let i = i0; i < i1; i++) {
      if (lvl.min[i] < lo) lo = lvl.min[i];
      if (lvl.max[i] > hi) hi = lvl.max[i];
    }
    const outside = t < startSec || t > endSec;
    if (outside !== dimmed) {
      ctx.globalAlpha = outside ? 0.35 : 1;
      dimmed = outside;
    }
    const yTop = mid - (hi / 127) * half;
    const yBot = mid - (lo / 127) * half;
    ctx.fillRect(x, yTop, 1, Math.max(1, yBot - yTop));
  }
  ctx.globalAlpha = 1;
}
