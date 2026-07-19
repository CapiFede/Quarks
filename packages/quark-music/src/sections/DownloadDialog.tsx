import { useEffect, useState, type CSSProperties } from "react";
import { Button, Icon, IconButton, TextInput, Toggle } from "@quarks/core";
import type { MusicStore } from "../store";
import { useMusicState } from "../hooks/useMusicStore";
import { fmtTime } from "../util";

export interface DownloadDialogProps {
  store: MusicStore;
}

/**
 * Diálogo de descarga de YouTube/otros (yt-dlp + ffmpeg). Vive dentro del pane
 * del quark (renderizado por `MusicPage`), no como overlay del Shell, porque el
 * contrato `Quark.buildOverlay` aún no lo monta el Shell. Posición fixed para
 * cubrir toda la ventana del quark.
 */
export function DownloadDialog({ store }: DownloadDialogProps) {
  const { download: d, playlists } = useMusicState(store);

  useEffect(() => {
    if (!d.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store.closeDownload();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [d.open, store]);

  if (!d.open) return null;

  return (
    <div
      onClick={() => store.closeDownload()}
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
          width: 460,
          maxWidth: "calc(100vw - 40px)",
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
        <Header onClose={() => store.closeDownload()} />
        <Body store={store} state={d} playlists={playlists} />
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Icon name="download" size={18} color="var(--q-primary-light)" />
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Descargar de YouTube</div>
      <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
    </div>
  );
}

function Body({
  store,
  state,
  playlists,
}: {
  store: MusicStore;
  state: ReturnType<typeof useMusicState>["download"];
  playlists: ReturnType<typeof useMusicState>["playlists"];
}) {
  switch (state.step) {
    case "needsSetup":
      return (
        <Section>
          <p style={pStyle}>
            Para descargar música hace falta instalar <b>yt-dlp</b> y <b>ffmpeg</b>. Se bajan
            una sola vez (~80 MB) y quedan en la carpeta de la app.
          </p>
          <Button variant="filled" icon="download" onClick={() => void store.runSetup()}>
            Instalar binarios
          </Button>
          {state.error && <ErrorLine message={state.error} />}
        </Section>
      );

    case "settingUp": {
      const label =
        state.setup?.name === "yt-dlp"
          ? "Descargando yt-dlp…"
          : state.setup?.name === "ffmpeg"
            ? "Descargando ffmpeg…"
            : state.setup?.name === "extracting"
              ? "Extrayendo…"
              : "Preparando…";
      return (
        <Section>
          <div style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>{label}</div>
          <ProgressBar pct={state.setup?.pct ?? 0} />
        </Section>
      );
    }

    case "input":
      return (
        <Section>
          <TextInput
            value={state.url}
            onChange={(v) => store.setDownloadUrl(v)}
            placeholder="https://www.youtube.com/watch?v=…"
            icon="link"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void store.probe();
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button
              variant="filled"
              icon="search"
              disabled={!state.url.trim()}
              onClick={() => void store.probe()}
            >
              Probar
            </Button>
          </div>
        </Section>
      );

    case "probing":
      return (
        <Section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 0",
              color: "var(--q-text-secondary)",
              fontSize: 13,
            }}
          >
            <Icon name="sync" size={18} color="var(--q-text-light)" />
            Analizando la URL…
          </div>
        </Section>
      );

    case "preview": {
      const p = state.probe;
      if (!p) return null;
      return (
        <Section>
          <Preview probe={p} />
          {!p.isPlaylist && (
            <Field label="Nombre del archivo">
              <TextInput
                value={state.customName}
                onChange={(v) => store.setDownloadCustomName(v)}
                placeholder={p.title}
              />
            </Field>
          )}
          <Field label="Volumen">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle
                checked={state.normalize}
                onChange={() => store.toggleDownloadNormalize()}
              />
              <span style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
                Normalizar volumen (loudnorm)
              </span>
            </div>
          </Field>
          <Field label="Portada">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle
                checked={state.embedThumbnail}
                onChange={() => store.toggleDownloadEmbedThumbnail()}
              />
              <span style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
                Usar miniatura del video como portada
              </span>
            </div>
          </Field>
          <Field label="Agregar a playlists">
            {playlists.length === 0 ? (
              <span style={{ fontSize: 12, color: "var(--q-text-light)" }}>
                No hay playlists en este espacio.
              </span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {playlists.map((pl) => {
                  const active = state.targetPlaylistIds.includes(pl.id);
                  return (
                    <TargetChip
                      key={pl.id}
                      name={pl.name}
                      active={active}
                      onClick={() => store.toggleDownloadTarget(pl.id)}
                    />
                  );
                })}
              </div>
            )}
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="text" onClick={() => store.closeDownload()}>
              Cancelar
            </Button>
            <Button variant="filled" icon="download" onClick={() => void store.runDownload()}>
              Descargar
            </Button>
          </div>
        </Section>
      );
    }

    case "downloading": {
      const prog = state.progress;
      const showMulti = (prog?.total ?? 1) > 1;
      const title =
        prog?.converting && prog.title
          ? `Convirtiendo: ${prog.title}`
          : prog?.title
            ? `Descargando: ${prog.title}`
            : prog?.converting
              ? "Convirtiendo a MP3 / normalizando…"
              : "Descargando…";
      return (
        <Section>
          {showMulti && (
            <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
              Canción {prog?.index ?? 1} de {prog?.total ?? 1}
            </div>
          )}
          <div
            style={{
              fontSize: 12,
              color: "var(--q-text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          <ProgressBar pct={prog?.pct ?? 0} indeterminate={!!prog?.converting} />
        </Section>
      );
    }

    case "done":
      return (
        <Section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 13,
              color: "var(--q-text-primary)",
            }}
          >
            <Icon name="check_circle" size={20} color="var(--q-primary-light)" />
            {state.resultPaths.length === 1
              ? "Canción agregada a tu biblioteca."
              : `${state.resultPaths.length} canciones agregadas a tu biblioteca.`}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button
              variant="outlined"
              icon="add"
              onClick={() => void store.openDownload()}
            >
              Otra
            </Button>
            <Button variant="filled" onClick={() => store.closeDownload()}>
              Listo
            </Button>
          </div>
        </Section>
      );

    case "error":
      return (
        <Section>
          <ErrorLine message={state.error ?? "Error desconocido."} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="text" onClick={() => store.closeDownload()}>
              Cerrar
            </Button>
            <Button
              variant="filled"
              icon="refresh"
              onClick={() => void store.openDownload()}
            >
              Reintentar
            </Button>
          </div>
        </Section>
      );

    default:
      return null;
  }
}

function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: ".4px",
          textTransform: "uppercase",
          color: "var(--q-text-secondary)",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Preview({
  probe,
}: {
  probe: NonNullable<ReturnType<typeof useMusicState>["download"]["probe"]>;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: 10,
        background: "var(--q-surface-alt)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          flex: "0 0 72px",
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--q-background)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {probe.thumbnail ? (
          <img
            src={probe.thumbnail}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <Icon name="music_note" size={28} color="var(--q-text-light)" />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {probe.title}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--q-text-secondary)" }}>
          {probe.isPlaylist
            ? `Playlist · ${probe.count} canciones`
            : probe.durationSec
              ? fmtTime(probe.durationSec)
              : "Canción"}
          {probe.uploader ? ` · ${probe.uploader}` : ""}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, indeterminate }: { pct: number; indeterminate?: boolean }) {
  return (
    <div
      style={{
        height: 6,
        width: "100%",
        background: "var(--q-surface-alt)",
        borderRadius: 9999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: indeterminate ? "40%" : `${Math.max(0, Math.min(1, pct)) * 100}%`,
          background: "var(--q-primary-light)",
          borderRadius: 9999,
          transition: "width var(--q-dur-fast) var(--q-ease)",
          opacity: indeterminate ? 0.7 : 1,
        }}
      />
    </div>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "8px 10px",
        background: "rgba(227,181,181,.08)",
        border: "1px solid var(--q-error)",
        borderRadius: 6,
        fontSize: 12,
        color: "var(--q-error)",
      }}
    >
      <Icon name="error" size={14} color="var(--q-error)" />
      <span style={{ flex: 1 }}>{message}</span>
    </div>
  );
}

function TargetChip({
  name,
  active,
  onClick,
}: {
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const style: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "2px 8px",
    height: 24,
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 6,
    cursor: "default",
    background: active
      ? "var(--q-primary-soft)"
      : hover
        ? "var(--q-card-hover)"
        : "var(--q-surface-alt)",
    color: active ? "var(--q-primary-light)" : "var(--q-text-secondary)",
    transition:
      "background var(--q-dur-fast) var(--q-ease), color var(--q-dur-fast) var(--q-ease)",
  };
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={style}
    >
      <Icon name={active ? "check" : "add"} size={13} />
      {name}
    </span>
  );
}

const pStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--q-text-secondary)",
};
