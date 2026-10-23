import { useEffect, type CSSProperties } from "react";
import {
  Button,
  Icon,
  IconButton,
  TextInput,
  Toggle,
  useStoreState,
  ProgressBar,
} from "@quarks/core";
import type { MusicStore, PlaylistGroup } from "../store";
import { fmtTime } from "../util";
import { Chip } from "./Chip";

export interface DownloadDialogProps {
  store: MusicStore;
  /** Playlists agrupadas por categoría, para elegir destinos. */
  groups: PlaylistGroup[];
}

/**
 * Diálogo de descarga de YouTube/otros (yt-dlp + ffmpeg). Vive dentro del pane
 * del quark (renderizado por `MusicPage`) con posición fixed para cubrir toda
 * la ventana del quark.
 *
 * Es UN solo form: la URL siempre visible arriba; al probarla aparece el
 * preview + opciones debajo, la descarga muestra su progreso ahí mismo y al
 * terminar se limpian los campos con un banner de éxito (listo para otro link).
 * Solo se cierra explícitamente (X, Cancelar o Escape) — el click en el fondo
 * no cierra, para no perder una descarga configurada por un mis-click.
 */
export function DownloadDialog({ store, groups }: DownloadDialogProps) {
  const { download: d } = useStoreState(store);

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
      <style>{"@keyframes qm-spin { to { transform: rotate(360deg); } }"}</style>
      <div
        style={{
          width: 460,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 60px)",
          // Sin scroll propio: si no entra, se achica (y scrollea) solo el
          // selector de playlists, así la X y los botones quedan siempre a mano.
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
        <Body store={store} state={d} groups={groups} />
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

type DlState = ReturnType<MusicStore["getSnapshot"]>["download"];

function Body({
  store,
  state,
  groups,
}: {
  store: MusicStore;
  state: DlState;
  groups: PlaylistGroup[];
}) {
  switch (state.step) {
    case "needsSetup": {
      // Solo se descarga lo que falta: en Linux es común que ffmpeg ya venga
      // del sistema y el único faltante sea yt-dlp.
      const missing = state.toolsMissing;
      const both = missing.ytDlp && missing.ffmpeg;
      const what = both ? (
        <>
          <b>yt-dlp</b> y <b>ffmpeg</b>
        </>
      ) : missing.ffmpeg ? (
        <b>ffmpeg</b>
      ) : (
        <b>yt-dlp</b>
      );
      const size = both ? "~80 MB" : missing.ffmpeg ? "~40 MB" : "~39 MB";
      return (
        <Section>
          <p style={pStyle}>
            Para descargar música hace falta instalar {what}. Se baja una sola vez ({size}) y
            queda en la carpeta de la app.
          </p>
          <Button variant="filled" icon="download" onClick={() => void store.runSetup()}>
            Instalar binarios
          </Button>
          {state.error && <ErrorLine message={state.error} />}
        </Section>
      );
    }

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
          <ProgressBar value={state.setup?.pct ?? 0} />
        </Section>
      );
    }

    case "updatingTools":
      return (
        <Section>
          <div style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
            Actualizando yt-dlp…
          </div>
          <ProgressBar value={state.setup?.pct ?? 0} />
        </Section>
      );

    // Fases del form unificado: mismo componente en la misma posición del
    // árbol para que React no remonte el input de URL entre pasos.
    case "input":
    case "probing":
    case "preview":
    case "downloading":
      return <Form store={store} state={state} groups={groups} />;

    // Solo fallas de instalación/estado de herramientas; los errores de
    // probe/descarga van inline dentro del form.
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

/**
 * Form unificado con layout ESTABLE: URL, preview, opciones y botones siempre
 * visibles — solo cambia el contenido del área de preview (placeholder /
 * analizando / canción) y aparece el progreso durante la descarga. Así el
 * popup no "salta" entre pantallas distintas.
 */
function Form({
  store,
  state,
  groups,
}: {
  store: MusicStore;
  state: DlState;
  groups: PlaylistGroup[];
}) {
  const probing = state.step === "probing";
  const downloading = state.step === "downloading";
  // Probe vigente: solo cuando la fase lo muestra (re-probar oculta el viejo).
  const loaded = state.step === "preview" || downloading ? state.probe : null;

  return (
    <Section style={{ minHeight: 0 }}>
      {state.completedCount != null && <SuccessLine count={state.completedCount} />}

      <div style={{ display: "flex", gap: 8 }}>
        <TextInput
          value={state.url}
          onChange={(v) => store.setDownloadUrl(v)}
          placeholder="https://www.youtube.com/watch?v=…"
          icon="link"
          autoFocus
          // Congelada mientras se analiza o descarga (la URL sigue visible).
          disabled={probing || downloading}
          style={{ flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void store.probe();
          }}
        />
        <Button
          variant="filled"
          icon={probing ? undefined : "search"}
          disabled={probing || downloading || !state.url.trim()}
          onClick={() => void store.probe()}
        >
          {probing ? (
            <>
              <Spinner />
              Analizando…
            </>
          ) : (
            "Probar"
          )}
        </Button>
      </div>

      {state.error && <ErrorLine message={state.error} />}

      {loaded ? <Preview probe={loaded} /> : <PreviewPlaceholder probing={probing} />}

      {downloading && <Progress prog={state.progress} />}

      {/* Opciones siempre visibles; congeladas mientras descarga. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          ...(downloading ? { opacity: 0.55, pointerEvents: "none" as const } : null),
        }}
      >
        <Field label="Nombre del archivo">
          <TextInput
            value={state.customName}
            onChange={(v) => store.setDownloadCustomName(v)}
            placeholder={
              loaded
                ? loaded.isPlaylist
                  ? "Se usa el título de cada video"
                  : loaded.title
                : "Se completa al probar el link"
            }
            disabled={!loaded || loaded.isPlaylist || downloading}
          />
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
        <Field label="Agregar a playlists" style={{ minHeight: 0 }}>
          <PlaylistPicker
            groups={groups}
            targetIds={state.targetPlaylistIds}
            onToggle={(id) => store.toggleDownloadTarget(id)}
          />
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button variant="text" onClick={() => store.closeDownload()}>
          Cancelar
        </Button>
        <Button
          variant="filled"
          icon={downloading ? undefined : "download"}
          disabled={!loaded || downloading}
          onClick={() => void store.runDownload()}
        >
          {downloading ? (
            <>
              <Spinner />
              Descargando…
            </>
          ) : (
            "Descargar"
          )}
        </Button>
      </div>
    </Section>
  );
}

/** Área de preview sin canción cargada: guía o spinner, mismas medidas que la card. */
function PreviewPlaceholder({ probing }: { probing: boolean }) {
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
          background: "var(--q-background)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {probing ? (
          <Spinner size={24} color="var(--q-text-light)" />
        ) : (
          <Icon name="music_note" size={28} color="var(--q-text-light)" />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--q-text-secondary)" }}>
          {probing ? "Analizando la URL…" : "Ninguna canción cargada"}
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: "var(--q-text-light)" }}>
          {probing
            ? "Puede tardar unos segundos."
            : "Pegá un link y dale a Probar para ver la vista previa."}
        </div>
      </div>
    </div>
  );
}

/** Chips de playlists destino, agrupadas por categoría (mismo layout que el trackpanel). */
function PlaylistPicker({
  groups,
  targetIds,
  onToggle,
}: {
  groups: PlaylistGroup[];
  targetIds: string[];
  onToggle: (id: string) => void;
}) {
  if (groups.length === 0) {
    return <span style={{ fontSize: 12, color: "var(--q-text-light)" }}>No hay playlists.</span>;
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        // Única parte del diálogo que scrollea. La barra va pegada al borde del
        // diálogo, no flotando entre los chips y el padding.
        minHeight: 0,
        overflowY: "auto",
        margin: "0 -20px 0 0",
        padding: "0 20px 0 0",
      }}
    >
      {groups.map((g) => (
        // Sin `flexShrink: 0` WebKit achica cada grupo al alto de una sola fila
        // de chips (mide mal el min-content de un flex con wrap) y, cuando no
        // entran, los grupos se pisan en vez de scrollear.
        <div key={g.category?.id ?? "loose"} style={{ flexShrink: 0 }}>
          {g.category && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 10,
                fontWeight: 500,
                color: "var(--q-text-light)",
                marginBottom: 5,
              }}
            >
              <Icon name="folder" size={12} />
              {g.category.name}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.playlists.map((pl) => (
              <Chip
                key={pl.id}
                label={pl.name}
                active={targetIds.includes(pl.id)}
                onClick={() => onToggle(pl.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Progreso de la descarga en curso (dentro del form, debajo del preview). */
function Progress({ prog }: { prog: DlState["progress"] }) {
  // La descarga falló por yt-dlp viejo: se está actualizando y va a
  // reintentar sola. Explicamos la pausa en lugar del progreso del audio.
  if (prog?.updatingTools) {
    return (
      <Section>
        <div style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
          Actualizando yt-dlp y reintentando…
        </div>
        <ProgressBar value={prog.updatingTools.pct} />
        <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
          YouTube cambió algo y la versión instalada quedó vieja.
        </div>
      </Section>
    );
  }

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
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: "var(--q-text-secondary)",
        }}
      >
        <Spinner size={14} color="var(--q-text-light)" />
        <span
          style={{
            flex: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
      </div>
      <ProgressBar value={prog?.pct ?? 0} indeterminate={!!prog?.converting} />
      {!prog?.converting && (prog?.speed || prog?.eta) && (
        <div
          style={{
            fontSize: 11,
            color: "var(--q-text-light)",
            display: "flex",
            gap: 10,
          }}
        >
          <span>{Math.round((prog?.pct ?? 0) * 100)}%</span>
          {prog?.speed && <span>{prog.speed}</span>}
          {prog?.eta && <span>faltan {prog.eta}</span>}
        </div>
      )}
    </Section>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12, ...style }}>{children}</div>;
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, ...style }}>
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

function Preview({ probe }: { probe: NonNullable<DlState["probe"]> }) {
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

/** Arco girando (la fuente es Material Symbols completa: la ligatura existe). */
function Spinner({ size = 16, color }: { size?: number; color?: string }) {
  return (
    <Icon
      name="progress_activity"
      size={size}
      color={color}
      style={{ animation: "qm-spin .8s linear infinite" }}
    />
  );
}

function SuccessLine({ count }: { count: number }) {
  // count 0 = yt-dlp salteó todo porque el/los archivos ya existían (no pisa
  // archivos): no hay nada nuevo que anunciar, pero sí que explicar.
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        background: "var(--q-primary-soft)",
        borderRadius: 6,
        fontSize: 12,
        color: "var(--q-primary-light)",
      }}
    >
      <Icon name={count === 0 ? "info" : "check_circle"} size={16} color="var(--q-primary-light)" />
      <span style={{ flex: 1 }}>
        {count === 0
          ? "Ya estaba en tu biblioteca — no se descargó de nuevo."
          : count === 1
            ? "Canción agregada a tu biblioteca."
            : `${count} canciones agregadas a tu biblioteca.`}
      </span>
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

const pStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--q-text-secondary)",
};
