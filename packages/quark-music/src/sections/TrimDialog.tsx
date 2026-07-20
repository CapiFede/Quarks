import { useEffect, useRef } from "react";
import { Button, Icon, IconButton } from "@quarks/core";
import type { MusicStore, TrimState } from "../store";
import { useMusicState } from "../hooks/useMusicStore";
import { TrimWave } from "./TrimWave";
import { fmtTime, fmtFine } from "../util";

export interface TrimDialogProps {
  store: MusicStore;
}

const EPS = 0.02;

/**
 * Diálogo de recorte (botón "Editar" del trackpanel): waveform con zoom y dos
 * manijas para cortar el inicio y el final de la canción, preview confinada al
 * rango y guardado como copia o sobrescribiendo. Mismo molde de overlay que
 * `DownloadDialog`; Escape lo maneja el quark (`onEscape`).
 */
export function TrimDialog({ store }: TrimDialogProps) {
  const { trim } = useMusicState(store);
  if (!trim.open) return null;
  return <Dialog store={store} t={trim} />;
}

function Dialog({ store, t }: { store: MusicStore; t: TrimState }) {
  const exporting = t.step === "exporting";

  // Espacio togglea la preview (mientras el diálogo está montado).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        store.trimTogglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  return (
    <div
      onClick={() => store.closeTrim()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.5)",
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 860,
          maxWidth: "calc(100vw - 48px)",
          background: "var(--q-surface)",
          border: "1px solid var(--q-border-light)",
          borderRadius: 12,
          padding: 20,
          boxShadow: "0 18px 50px rgba(0,0,0,.45)",
          color: "var(--q-text-primary)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Icon name="content_cut" size={18} color="var(--q-primary-light)" />
          <div
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Recortar {t.name}
          </div>
          {!exporting && <IconButton name="close" tooltip="Cerrar" onClick={() => store.closeTrim()} />}
        </div>

        {t.step === "loading" && <Loading />}
        {t.step === "error" && <LoadError error={t.error} />}
        {(t.step === "ready" || exporting) && <Editor store={store} t={t} />}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "28px 0",
        fontSize: 12,
        color: "var(--q-text-secondary)",
      }}
    >
      <Icon name="sync" size={26} color="var(--q-text-light)" />
      Leyendo el archivo y calculando el waveform…
    </div>
  );
}

function LoadError({ error }: { error: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "18px 4px",
        fontSize: 12.5,
        color: "var(--q-error)",
      }}
    >
      <Icon name="error" size={20} color="var(--q-error)" />
      {error ?? "No se pudo abrir el archivo."}
    </div>
  );
}

function Editor({ store, t }: { store: MusicStore; t: TrimState }) {
  const exporting = t.step === "exporting";
  const keptLen = t.endSec - t.startSec;
  // Sin recorte real no hay nada que guardar.
  const untouched = t.startSec < EPS && t.endSec > t.durationSec - EPS;

  return (
    <>
      <Preview store={store} t={t} />

      <TrimWave
        durationSec={t.durationSec}
        peaks={t.peaks}
        startSec={t.startSec}
        endSec={t.endSec}
        positionSec={t.positionSec}
        playing={t.playing}
        onTrimStart={(s) => store.setTrimStart(s)}
        onTrimEnd={(s) => store.setTrimEnd(s)}
        onSeek={(s) => store.trimSeek(s)}
      />

      {/* Transporte + readout del rango. */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <PlayButton playing={t.playing} onClick={() => store.trimTogglePlay()} />
        <span
          style={{
            fontSize: 11.5,
            fontFamily: "var(--q-font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--q-text-light)",
          }}
        >
          inicio {fmtFine(t.startSec)}
          <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
          fin {fmtFine(t.endSec)}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11.5,
            fontFamily: "var(--q-font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--q-text-secondary)",
          }}
        >
          queda {fmtTime(keptLen)} de {fmtTime(t.durationSec)}
        </span>
      </div>

      {t.error && (
        <div style={{ fontSize: 11.5, color: "var(--q-error)" }}>{t.error}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {exporting ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              color: "var(--q-text-secondary)",
            }}
          >
            <Icon name="hourglass_top" size={16} />
            Exportando con ffmpeg…
          </span>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--q-text-light)" }}>
            Sobrescribir reemplaza el archivo. No se puede deshacer.
          </span>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <Button
            variant="soft"
            icon="library_add"
            disabled={exporting || untouched}
            onClick={() => void store.saveTrim("copy")}
          >
            Guardar copia
          </Button>
          <Button
            variant="filled"
            icon="save"
            disabled={exporting || untouched}
            onClick={() => void store.saveTrim("overwrite")}
          >
            Sobrescribir
          </Button>
        </span>
      </div>
    </>
  );
}

/**
 * Dueño del `<audio>` de la preview, confinada al rango a conservar: al llegar
 * al fin del rango (o del archivo) pausa y rebobina al inicio del recorte; al
 * dar play desde afuera del rango, arranca en el inicio.
 */
function Preview({ store, t }: { store: MusicStore; t: TrimState }) {
  const elRef = useRef<HTMLAudioElement>(null);
  // Snapshot vivo del rango para los handlers del elemento.
  const range = useRef({ start: t.startSec, end: t.endSec });
  range.current = { start: t.startSec, end: t.endSec };

  // Play / pause dirigido por el store.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    if (t.playing) {
      const { start, end } = range.current;
      if (el.currentTime < start - EPS || el.currentTime >= end - EPS) {
        el.currentTime = start;
        store.setTrimPosition(start);
      }
      void el.play().catch(() => store.setTrimPlaying(false));
    } else {
      el.pause();
    }
  }, [t.playing, store]);

  // Seek externo (waveform).
  useEffect(() => {
    const el = elRef.current;
    if (!el || t.seekNonce === 0) return;
    el.currentTime = t.positionSec;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.seekNonce]);

  const rewind = () => {
    const el = elRef.current;
    if (!el) return;
    el.pause();
    store.setTrimPlaying(false);
    el.currentTime = range.current.start;
    store.setTrimPosition(range.current.start);
  };

  const onTimeUpdate = () => {
    const el = elRef.current;
    if (!el) return;
    if (el.currentTime >= range.current.end - EPS) rewind();
    else store.setTrimPosition(el.currentTime);
  };

  if (!t.mediaUrl) return null;
  return (
    <audio
      ref={elRef}
      src={t.mediaUrl}
      onTimeUpdate={onTimeUpdate}
      onEnded={rewind}
      onPlay={() => store.setTrimPlaying(true)}
      onPause={() => store.setTrimPlaying(false)}
      style={{ display: "none" }}
    />
  );
}

function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: "var(--q-primary-light)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "default",
        flex: "0 0 auto",
      }}
    >
      <Icon name={playing ? "pause" : "play_arrow"} size={18} fill={1} color="#fff" />
    </span>
  );
}
