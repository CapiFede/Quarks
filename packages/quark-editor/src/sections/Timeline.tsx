import { useEffect, useRef, useState } from "react";
import { IconButton } from "@quarks/core";
import type { EditorStore } from "../store";
import type { Segment } from "../types";
import { useEditorState } from "../hooks/useEditorStore";
import { fmtFine, fmtScaled } from "../util";

export interface TimelineProps {
  store: EditorStore;
}

const TRACK_H = 84;
const MINIMAP_H = 16;
const EPS = 0.001;
/** Máximo zoom: ~milisegundo por pixel. */
const MAX_PPS = 2000;

/**
 * Línea de tiempo con zoom. Internamente trabaja sobre una "ventana" visible
 * `[viewStart, viewStart + viewDur]` en segundos (no sobre el clip entero), así
 * el zoom llega a precisión de milisegundos sin canvases gigantes. Rueda = paneo;
 * Ctrl+rueda = zoom; minimapa abajo para ubicarse. Click = seek; arrastrar =
 * marcar para cortar (X).
 */
export function Timeline({ store }: TimelineProps) {
  const { source, peaks, segments, selection, positionSec, mode } = useEditorState(store);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragging = useRef<null | "select" | "scrub">(null);
  const dragStart = useRef(0);

  const [width, setWidth] = useState(0);
  /** Pixeles por segundo (zoom). 0 = aún sin medir; el efecto lo lleva a "fit". */
  const [pps, setPps] = useState(0);
  const [viewStart, setViewStart] = useState(0);
  const [hoverT, setHoverT] = useState<number | null>(null);

  const total = source?.durationSec || 1;
  const fitPps = width > 0 ? width / total : 0;
  const effPps = pps > 0 ? pps : fitPps;
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

  // Al cambiar de clip, volver a "fit".
  useEffect(() => {
    setPps(0);
    setViewStart(0);
  }, [source?.workPath]);

  const clampStart = (s: number, dur: number) => Math.max(0, Math.min(s, Math.max(0, total - dur)));

  /** Zoom manteniendo `anchorT` fijo en su pixel. */
  const zoomAround = (nextPps: number, anchorT: number) => {
    const np = Math.max(fitPps, Math.min(MAX_PPS, nextPps));
    const x = (anchorT - viewStart) * effPps; // pixel actual del ancla
    const nDur = width / np;
    const ns = clampStart(anchorT - x / np, nDur);
    setPps(np);
    setViewStart(ns);
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
        const cursorT = vs + ((e.clientX - rect.left) / w) * (w / ep);
        const np = Math.max(fit, Math.min(MAX_PPS, ep * Math.exp(-e.deltaY * 0.0015)));
        const x = (cursorT - vs) * ep;
        const nDur = w / np;
        const ns = Math.max(0, Math.min(cursorT - x / np, Math.max(0, tot - nDur)));
        setPps(np);
        setViewStart(ns);
      } else {
        const delta = (e.deltaX || e.deltaY) / ep;
        const dur = w / ep;
        setViewStart(Math.max(0, Math.min(vs + delta, Math.max(0, tot - dur))));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redibujar el waveform de la ventana visible.
  useEffect(() => {
    drawWaveform(canvasRef.current, peaks, segments, viewStart, viewDur, total, width, TRACK_H);
  }, [peaks, segments, viewStart, viewDur, total, width]);

  // Seguir el playhead durante la reproducción si se sale de la ventana.
  useEffect(() => {
    if (positionSec < viewStart || positionSec > viewStart + viewDur) {
      setViewStart(clampStart(positionSec - viewDur * 0.15, viewDur));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionSec]);

  if (!source) return null;

  const timeAt = (clientX: number): number => {
    const el = wrapRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const t = viewStart + ((clientX - rect.left) / width) * viewDur;
    return Math.max(0, Math.min(total, t));
  };
  const xOf = (t: number) => (t - viewStart) * effPps;
  const inView = (t: number) => t >= viewStart - EPS && t <= viewStart + viewDur + EPS;

  const onPointerDown = (e: React.PointerEvent) => {
    // Capturar el puntero: el arrastre sigue aunque el mouse salga del track.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const t = timeAt(e.clientX);
    store.setCursor(t);
    if (mode === "select") {
      dragging.current = "select";
      dragStart.current = t;
      store.setSelection(null);
    } else {
      dragging.current = "scrub";
      store.requestSeek(t); // mover el playhead
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const t = timeAt(e.clientX);
    setHoverT(t);
    store.setCursor(t);
    if (dragging.current === "select") store.setSelection({ start: dragStart.current, end: t });
    else if (dragging.current === "scrub") store.requestSeek(t);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const wasSelect = dragging.current === "select";
    dragging.current = null;
    if (wasSelect) {
      const t = timeAt(e.clientX);
      // Un click (sin arrastrar): selecciona la sección entera bajo el cursor.
      if (Math.abs(t - dragStart.current) < 0.5 / effPps + 0.005) {
        const seg = segments.find((s) => t >= s.start - EPS && t < s.end - EPS);
        store.setSelection(seg ? { start: seg.start, end: seg.end } : null);
      }
    }
  };

  const selA = selection ? Math.min(selection.start, selection.end) : 0;
  const selB = selection ? Math.max(selection.start, selection.end) : 0;
  const hasSel = selection && selB - selA > EPS;
  const zoomedIn = effPps > fitPps * 1.01;

  return (
    <div style={{ flex: "0 0 auto", padding: "0 18px" }}>
      <Ruler viewStart={viewStart} viewDur={viewDur} width={width} />

      <div
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (!dragging.current) setHoverT(null);
        }}
        style={{
          position: "relative",
          height: TRACK_H,
          borderRadius: 8,
          background: "var(--q-surface-alt)",
          border: "1px solid var(--q-border)",
          overflow: "hidden",
          cursor: mode === "select" ? "text" : "pointer",
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

        {/* Marcadores de corte: bordes internos entre tramos que se tocan (splits). */}
        {segments.slice(0, -1).map((s, i) =>
          Math.abs(s.end - segments[i + 1].start) < 0.0005 && inView(s.end) ? (
            <div
              key={`split-${i}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: xOf(s.end),
                width: 0,
                borderLeft: "2px solid var(--q-danger, #e5484d)",
                pointerEvents: "none",
              }}
            />
          ) : null,
        )}

        {hasSel && (inView(selA) || inView(selB) || (selA < viewStart && selB > viewStart + viewDur)) && (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: xOf(selA),
              width: (selB - selA) * effPps,
              background: "var(--q-danger-soft, rgba(229,72,77,.20))",
              borderLeft: "1px solid var(--q-danger, #e5484d)",
              borderRight: "1px solid var(--q-danger, #e5484d)",
              pointerEvents: "none",
            }}
          />
        )}

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
        <span style={{ flex: 1, textAlign: "center" }}>
          {hasSel ? (
            <span style={{ color: "var(--q-danger, #e5484d)", fontWeight: 600 }}>
              cortar {fmtFine(selA)} – {fmtFine(selB)} ({fmtFine(selB - selA)})
            </span>
          ) : (
            <span style={{ opacity: 0.7 }}>arrastrá para marcar · X para cortar · Ctrl+rueda zoom</span>
          )}
        </span>
        <IconButton name="zoom_out" tooltip="Alejar" size={14} onClick={() => zoomAround(effPps / 1.6, viewStart + viewDur / 2)} />
        <IconButton name="fit_screen" tooltip="Ver todo" size={14} onClick={() => { setPps(0); setViewStart(0); }} />
        <IconButton name="zoom_in" tooltip="Acercar" size={14} onClick={() => zoomAround(effPps * 1.6, viewStart + viewDur / 2)} />
      </div>

      {/* Minimapa: clip entero con la ventana visible resaltada (arrastrable). */}
      {zoomedIn && (
        <Minimap
          total={total}
          segments={segments}
          viewStart={viewStart}
          viewDur={viewDur}
          onScrub={(centerT) => setViewStart(clampStart(centerT - viewDur / 2, viewDur))}
        />
      )}
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
    <div style={{ position: "relative", height: 16 }}>
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

/** Minimapa del clip entero con la ventana visible, arrastrable para panear. */
function Minimap({
  total,
  segments,
  viewStart,
  viewDur,
  onScrub,
}: {
  total: number;
  segments: Segment[];
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
        // Capturar el puntero: seguir arrastrando aunque el mouse salga del minimapa.
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
      {segments.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${(s.start / total) * 100}%`,
            width: `${((s.end - s.start) / total) * 100}%`,
            background: "var(--q-primary-soft)",
          }}
        />
      ))}
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

/** Dibuja el waveform de la ventana visible, coloreando tramos vs huecos. */
function drawWaveform(
  canvas: HTMLCanvasElement | null,
  peaks: number[] | null,
  segments: Segment[],
  viewStart: number,
  viewDur: number,
  total: number,
  cssWidth: number,
  cssHeight: number,
) {
  if (!canvas || cssWidth <= 0 || viewDur <= 0) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const cs = getComputedStyle(canvas);
  const kept = cs.getPropertyValue("--q-primary-light").trim() || "#6ea8fe";
  const dim = cs.getPropertyValue("--q-border").trim() || "#3a3a3a";
  const mid = cssHeight / 2;

  if (!peaks || peaks.length === 0) return;
  const n = peaks.length;
  const isKept = (t: number) => segments.some((s) => t >= s.start - EPS && t < s.end - EPS);

  for (let x = 0; x < cssWidth; x++) {
    const t = viewStart + (x / cssWidth) * viewDur;
    if (t < 0 || t > total) continue;
    const i = Math.min(n - 1, Math.floor((t / total) * n));
    const amp = peaks[i];
    const h = Math.max(1, amp * (cssHeight * 0.86));
    const on = isKept(t);
    ctx.fillStyle = on ? kept : dim;
    ctx.globalAlpha = on ? 1 : 0.5;
    ctx.fillRect(x, mid - h / 2, 1, h);
  }
  ctx.globalAlpha = 1;
}
