import { useEffect, useRef } from "react";
import { Button, Icon, IconButton, useStoreState } from "@quarks/core";
import type { MusicStore, TrimState } from "../store";
import { TrimWave } from "./TrimWave";
import { PreviewPlayer } from "../services/trim";
import { fmtTime, fmtFine } from "../util";
import { PlayButton } from "./PlayButton";

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
  const { trim } = useStoreState(store);
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
        <PlayButton playing={t.playing} size={34} onClick={() => store.trimTogglePlay()} />
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
 * Dueño de la preview, confinada al rango a conservar: al llegar al fin del
 * rango pausa y rebobina al inicio del recorte; al dar play desde afuera del
 * rango, arranca en el inicio. Suena con `PreviewPlayer` (Web Audio sobre el
 * mismo buffer que dibuja la onda, ver trim.ts).
 */
function Preview({ store, t }: { store: MusicStore; t: TrimState }) {
  const playerRef = useRef<PreviewPlayer | null>(null);
  // Snapshot vivo del rango y la posición para los handlers.
  const range = useRef({ start: t.startSec, end: t.endSec });
  range.current = { start: t.startSec, end: t.endSec };
  const position = useRef(t.positionSec);
  position.current = t.positionSec;

  const rewind = () => {
    playerRef.current?.stop();
    store.setTrimPlaying(false);
    store.setTrimPosition(range.current.start);
  };

  // Un reproductor por audio decodificado; se cierra con el diálogo.
  useEffect(() => {
    if (!t.audio) return;
    const player = new PreviewPlayer(t.audio);
    playerRef.current = player;
    return () => {
      player.close();
      playerRef.current = null;
    };
  }, [t.audio]);

  // Play / pause dirigido por el store.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    if (t.playing) {
      const { start, end } = range.current;
      let from = position.current;
      if (from < start - EPS || from >= end - EPS) {
        from = start;
        store.setTrimPosition(start);
      }
      player.play(from, end, rewind);
    } else if (player.playing) {
      store.setTrimPosition(player.stop());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.playing, store]);

  // Seek externo (waveform): si está sonando, sigue desde ahí; en pausa basta
  // con la posición del store (el próximo play arranca de ahí).
  useEffect(() => {
    const player = playerRef.current;
    if (!player?.playing || t.seekNonce === 0) return;
    player.play(t.positionSec, range.current.end, rewind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.seekNonce]);

  // La manija del final se movió mientras suena: el corte la sigue.
  useEffect(() => {
    playerRef.current?.setUntil(t.endSec);
  }, [t.endSec]);

  // El playhead sigue a la reproducción.
  useEffect(() => {
    if (!t.playing) return;
    const id = setInterval(() => {
      const player = playerRef.current;
      if (player?.playing) store.setTrimPosition(player.position());
    }, 100);
    return () => clearInterval(id);
  }, [t.playing, store]);

  return null;
}

