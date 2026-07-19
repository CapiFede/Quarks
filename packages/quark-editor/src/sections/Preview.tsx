import { useEffect, useRef } from "react";
import { Icon } from "@quarks/core";
import type { EditorStore } from "../store";
import type { Segment } from "../types";
import { useEditorState } from "../hooks/useEditorStore";
import { keptDuration } from "../store";
import { fmtTime } from "../util";

export interface PreviewProps {
  store: EditorStore;
}

const EPS = 0.02;

/** Índice del tramo que contiene `t`, o -1 si cae en un hueco eliminado. */
function segmentAt(segments: Segment[], t: number): number {
  return segments.findIndex((s) => t >= s.start - EPS && t < s.end - EPS);
}

/** Primer tramo cuyo final es posterior a `t` (a dónde saltar desde un hueco). */
function nextStart(segments: Segment[], t: number): number | null {
  for (const s of segments) {
    if (t < s.end - EPS) return Math.max(t, s.start);
  }
  return null;
}

/**
 * Reproductor de la preview. Posee el elemento media y reproduce SALTEANDO los
 * tramos eliminados: así suena/se ve como va a quedar el export, sin reprocesar.
 */
export function Preview({ store }: PreviewProps) {
  const { source, mediaUrl, playing, positionSec, seekNonce, segments } = useEditorState(store);
  const elRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  // Snapshot vivo de los segmentos para los handlers del elemento.
  const segRef = useRef<Segment[]>(segments);
  segRef.current = segments;

  // Play / pause dirigido por el store.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (playing) {
      // Si la posición cayó en un hueco, reubicar antes de sonar.
      const segs = segRef.current;
      if (segmentAt(segs, el.currentTime) < 0) {
        const j = nextStart(segs, el.currentTime) ?? segs[0]?.start ?? 0;
        el.currentTime = j;
      }
      void el.play().catch(() => store.setPlaying(false));
    } else {
      el.pause();
    }
  }, [playing, store]);

  // Seek externo (timeline / quitar selección).
  useEffect(() => {
    const el = elRef.current;
    if (!el || seekNonce === 0) return;
    el.currentTime = positionSec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekNonce]);

  const onTimeUpdate = () => {
    const el = elRef.current;
    if (!el) return;
    const segs = segRef.current;
    const t = el.currentTime;
    const idx = segmentAt(segs, t);
    if (idx < 0) {
      // En un hueco: saltar al próximo tramo o terminar.
      const j = nextStart(segs, t);
      if (j == null) {
        el.pause();
        store.setPlaying(false);
        const first = segs[0]?.start ?? 0;
        el.currentTime = first;
        store.setPosition(first);
        return;
      }
      el.currentTime = j;
      store.setPosition(j);
      return;
    }
    store.setPosition(t);
  };

  const onEnded = () => {
    store.setPlaying(false);
    const first = segRef.current[0]?.start ?? 0;
    const el = elRef.current;
    if (el) el.currentTime = first;
    store.setPosition(first);
  };

  if (!source || !mediaUrl) return null;

  const edited = keptDuration(segments);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "16px 18px 4px",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {source.hasVideo ? (
          <video
            ref={elRef}
            src={mediaUrl}
            onTimeUpdate={onTimeUpdate}
            onEnded={onEnded}
            onPlay={() => store.setPlaying(true)}
            onPause={() => store.setPlaying(false)}
            style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 10, background: "#000" }}
          />
        ) : (
          <>
            {/* El elemento de audio no se ve; la UI es la timeline. */}
            <audio
              ref={elRef}
              src={mediaUrl}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onPlay={() => store.setPlaying(true)}
              onPause={() => store.setPlaying(false)}
              style={{ display: "none" }}
            />
            <Icon name="graphic_eq" size={64} color="var(--q-border)" />
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <PlayButton playing={playing} onClick={() => store.togglePlay()} />
        <span
          style={{
            fontSize: 11.5,
            fontFamily: "var(--q-font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--q-text-light)",
          }}
        >
          {fmtTime(positionSec)} / {fmtTime(source.durationSec)}
          <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
          edición {fmtTime(edited)}
        </span>
      </div>
    </div>
  );
}

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: "var(--q-primary-light)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
      }}
    >
      <Icon name={playing ? "pause" : "play_arrow"} size={20} fill={1} color="#fff" />
    </span>
  );
}
