import { memo, useEffect, useRef, useState } from "react";
import { Icon, Button, TextInput } from "@quarks/core";
import type { Track } from "../types";
import type { PlaylistGroup } from "../store";
import { fmtTime, RATING_MAX, ratingColor } from "../util";
import * as library from "../services/library";
import { CoverCropDialog } from "./CoverCropDialog";
import { Chip } from "./Chip";

export interface TrackPanelProps {
  track: Track | null;
  /** Veces que se escuchó `track`. */
  plays: number;
  /** Puntaje de `track` (1 a `RATING_MAX`), o `null` si no tiene. */
  rating: number | null;
  /** Pone el puntaje de `track`; `null` se lo saca. */
  onRate: (score: number | null) => void;
  /** Playlists agrupadas por categoría (las sueltas primero). */
  groups: PlaylistGroup[];
  onPlay: (path: string) => void;
  /** Abre el diálogo de recorte (trim) con esta canción. */
  onEdit: (track: Track) => void;
  onToggleInPlaylist: (playlistId: string, isIn: boolean) => void;
  onRename: (path: string, newName: string) => Promise<void> | void;
  onDelete: (path: string) => Promise<void> | void;
}

/** Panel lateral derecho (260px): cover editable, título editable, metadata
 * (con el puntaje editable), pertenencia a playlists (agrupada por categoría) y acciones (borrar). */
export const TrackPanel = memo(function TrackPanel({
  track,
  plays,
  rating,
  onRate,
  groups,
  onPlay,
  onEdit,
  onToggleInPlaylist,
  onRename,
  onDelete,
}: TrackPanelProps) {
  return (
    <div
      style={{
        width: 260,
        flex: "0 0 260px",
        background: "var(--q-surface)",
        padding: "18px 18px 0",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {/* La portada y el título quedan fuera del scroll: así la portada siempre
          mide lo mismo (si scrolleara, la barra de 10px le comería ancho) y
          ninguno de los dos se va de vista. */}
      <Cover track={track} />
      {track && (
        <EditableTitle
          key={track.path}
          track={track}
          onRename={(name) => onRename(track.path, name)}
        />
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          // Hasta el borde del panel: la barra de scroll va pegada al borde,
          // no flotando entre el contenido y el padding.
          margin: "0 -18px 0 0",
          padding: "0 18px 18px 0",
        }}
      >
        {track ? (
          <>
            <div
              style={{
                marginTop: 18,
                display: "grid",
                // Duración | valor | Reproducciones | valor en la primera fila;
                // el puntaje usa las dos primeras columnas.
                gridTemplateColumns: "auto 1fr auto auto",
                columnGap: 10,
                rowGap: 5,
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--q-text-light)" }}>Duración</span>
              <span style={{ fontFamily: "var(--q-font-mono)" }}>{fmtTime(track.durationSec)}</span>
              <span style={{ color: "var(--q-text-light)" }}>Reproducciones</span>
              <span style={{ fontFamily: "var(--q-font-mono)" }}>{plays}</span>
              <RatingEditor key={track.path} value={rating} onChange={onRate} />
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <Button
                variant="filled"
                icon="play_arrow"
                style={{ flex: 1 }}
                onClick={() => onPlay(track.path)}
              >
                Reproducir
              </Button>
              <Button variant="soft" icon="content_cut" onClick={() => onEdit(track)}>
                Editar
              </Button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: ".4px",
                  textTransform: "uppercase",
                  color: "var(--q-text-secondary)",
                  marginBottom: 8,
                }}
              >
                Playlists
              </div>
              {groups.length === 0 ? (
                <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>No hay playlists.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {groups.map((g) => (
                    <div key={g.category?.id ?? "loose"}>
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
                        {g.playlists.map((p) => {
                          const isIn = p.trackPaths.includes(track.path);
                          return (
                            <Chip
                              key={p.id}
                              label={p.name}
                              active={isIn}
                              onClick={() => onToggleInPlaylist(p.id, isIn)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DeleteSection track={track} onDelete={onDelete} />
          </>
        ) : (
          <div style={{ marginTop: 18, fontSize: 12, color: "var(--q-text-light)", textAlign: "center" }}>
            Seleccioná un track para ver sus datos.
          </div>
        )}
      </div>
    </div>
  );
});

// ── Cover ─────────────────────────────────────────────────────────────────────

function Cover({ track }: { track: Track | null }) {
  const [cover, setCover] = useState<string | null>(null);
  const [hover, setHover] = useState(false);
  /** Texto del overlay mientras se lee/baja/guarda una imagen; `null` = libre. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Texto del input de link de YouTube; `null` = input cerrado. */
  const [ytUrl, setYtUrl] = useState<string | null>(null);
  /** Imagen abierta en el editor de portada (data URL); `null` = cerrado. */
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    setYtUrl(null);
    setEditing(null);
    setError(null);
    if (!track) {
      setCover(null);
      return;
    }
    const seq = ++reqId.current;
    library
      .getCover(track.path)
      .then((c) => {
        if (seq === reqId.current) setCover(c);
      })
      .catch(() => {
        if (seq === reqId.current) setCover(null);
      });
  }, [track?.path]);

  /** Corre `task` con `label` en el overlay. Si falla deja el error y devuelve
   * `null`; si en el medio se cambió de track, el resultado se descarta. */
  const run = async (label: string, task: (path: string) => Promise<string>): Promise<string | null> => {
    if (!track || busy) return null;
    const seq = reqId.current;
    setBusy(label);
    setError(null);
    try {
      const out = await task(track.path);
      return seq === reqId.current ? out : null;
    } catch (e) {
      if (seq === reqId.current) setError(String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  // Elegir archivo y link de YouTube no embeben directo: abren el editor con la
  // imagen para encuadrarla, y se guarda desde ahí.
  const onPick = async () => {
    const picked = await library.pickImage().catch(() => null);
    if (!picked) return;
    const src = await run("Cargando…", () => library.readImage(picked));
    if (src) setEditing(src);
  };

  const onYoutube = async () => {
    const url = ytUrl?.trim();
    if (!url) return;
    const src = await run("Bajando miniatura…", () => library.youtubeThumb(url));
    if (src) {
      setYtUrl(null);
      setEditing(src);
    }
  };

  /** Embebe la portada que armó el editor y la recarga. */
  const onSave = async (dataUrl: string) => {
    const fresh = await run("Guardando…", async (p) => {
      await library.setCover(p, dataUrl);
      return (await library.getCover(p)) ?? dataUrl;
    });
    if (fresh) {
      setCover(fresh);
      setEditing(null);
    }
  };

  const closeYoutube = () => {
    setYtUrl(null);
    setError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setError(null);
  };

  const clickable = !!track;
  return (
    <>
      <div
        onMouseEnter={() => clickable && setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          // Sin esto, con muchas playlists el panel (columna flex) la achica de
          // alto y deja de ser cuadrada: el resto del contenido scrollea.
          flexShrink: 0,
          background: cover ? "var(--q-background)" : "linear-gradient(135deg, #2A7E73 0%, #2A2D31 100%)",
          border: "1px solid var(--q-border-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {cover ? (
          <img
            src={cover}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Icon name="music_note" size={64} color="rgba(255,255,255,.18)" weight={300} />
        )}
        {clickable && (hover || !!busy) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {busy ? (
              <>
                <Icon name="sync" size={26} color="#fff" />
                {busy}
              </>
            ) : (
              <>
                <OverlayButton icon="image" label="Elegir archivo" onClick={() => void onPick()} />
                <OverlayButton icon="link" label="Link de YouTube" onClick={() => setYtUrl("")} />
                {cover && <OverlayButton icon="crop" label="Ajustar" onClick={() => setEditing(cover)} />}
              </>
            )}
          </div>
        )}
      </div>

      {ytUrl !== null && (
        <TextInput
          value={ytUrl}
          onChange={setYtUrl}
          placeholder="Pegá el link del video"
          icon="link"
          autoFocus
          disabled={!!busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onYoutube();
            else if (e.key === "Escape") closeYoutube();
          }}
          onBlur={() => {
            if (!ytUrl.trim()) closeYoutube();
          }}
          style={{ marginTop: 10, background: "var(--q-surface-alt)" }}
        />
      )}
      {error && !editing && (
        <div style={{ marginTop: 6, fontSize: 11, color: "var(--q-error)", wordBreak: "break-word" }}>
          {error}
        </div>
      )}
      {editing && (
        <CoverCropDialog
          src={editing}
          busy={!!busy}
          error={error}
          onCancel={closeEditor}
          onSave={(dataUrl) => void onSave(dataUrl)}
        />
      )}
    </>
  );
}

function OverlayButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        width: 150,
        padding: "7px 12px",
        border: "none",
        borderRadius: 6,
        background: hover ? "rgba(255,255,255,.24)" : "rgba(255,255,255,.12)",
        color: "#fff",
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 500,
        cursor: "pointer",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={16} color="#fff" />
      {label}
    </button>
  );
}

// ── Título editable ───────────────────────────────────────────────────────────

function EditableTitle({
  track,
  onRename,
}: {
  track: Track;
  onRename: (name: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.title);
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincronizar el draft cuando cambia el track (entrada con key={path} ya
  // remonta este componente, pero lo dejamos por defensa).
  useEffect(() => {
    setDraft(track.title);
    setEditing(false);
  }, [track.path, track.title]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const name = draft.trim();
    if (!name || name === track.title) {
      setDraft(track.title);
      setEditing(false);
      return;
    }
    setEditing(false);
    await onRename(name);
  };
  const cancel = () => {
    setDraft(track.title);
    setEditing(false);
  };

  return (
    <div
      style={{
        marginTop: 14,
        paddingBottom: 18,
        borderBottom: "1px solid var(--q-border)",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            else if (e.key === "Escape") cancel();
          }}
          style={{
            width: "100%",
            background: "var(--q-surface-alt)",
            border: "1px solid var(--q-primary-light)",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 15,
            fontWeight: 700,
            color: "var(--q-text-primary)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          title="Click para renombrar"
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: "var(--q-text-primary)",
            cursor: "text",
            padding: "4px 8px",
            margin: "-4px -8px",
            borderRadius: 6,
            background: hover ? "var(--q-card-hover)" : "transparent",
            transition: "background var(--q-dur-fast) var(--q-ease)",
            wordBreak: "break-word",
          }}
        >
          {track.title}
        </div>
      )}
    </div>
  );
}

// ── Puntaje ───────────────────────────────────────────────────────────────────

/**
 * Fila "Puntaje" de la metadata + barra de `RATING_MAX` segmentos debajo: click
 * en un segmento pone ese puntaje, click en el actual lo saca. Al pasar el
 * mouse se previsualiza. Va adentro del grid de la metadata (label | valor).
 */
function RatingEditor({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (score: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <>
      <span style={{ color: "var(--q-text-light)" }}>Puntaje</span>
      <span style={{ fontFamily: "var(--q-font-mono)" }}>
        {shown === null ? (
          <span style={{ color: "var(--q-text-light)" }}>—</span>
        ) : (
          <>
            <span style={{ color: ratingColor(shown), fontWeight: 600 }}>{shown}</span>
            <span style={{ color: "var(--q-text-light)" }}>/{RATING_MAX}</span>
          </>
        )}
      </span>
      <div
        onMouseLeave={() => setHover(null)}
        style={{ gridColumn: "1 / -1", display: "flex", gap: 3, marginTop: 2 }}
      >
        {Array.from({ length: RATING_MAX }, (_, i) => {
          const n = i + 1;
          const filled = shown !== null && n <= shown;
          return (
            <button
              key={n}
              type="button"
              aria-label={n === value ? "Quitar puntaje" : `Puntaje ${n}`}
              title={n === value ? "Quitar puntaje" : String(n)}
              onMouseEnter={() => setHover(n)}
              onClick={() => onChange(n === value ? null : n)}
              style={{
                flex: 1,
                height: 14,
                padding: 0,
                border: "none",
                borderRadius: 3,
                cursor: "pointer",
                background: filled ? ratingColor(shown) : "var(--q-surface-alt)",
                opacity: filled && hover !== null && hover !== value ? 0.75 : 1,
                transition: "background var(--q-dur-fast) var(--q-ease)",
              }}
            />
          );
        })}
      </div>
    </>
  );
}

// ── Botón borrar + confirmación ───────────────────────────────────────────────

function DeleteSection({
  track,
  onDelete,
}: {
  track: Track;
  onDelete: (path: string) => Promise<void> | void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Si cambia el track, salir del modo confirmación.
  useEffect(() => {
    setConfirming(false);
    setBusy(false);
  }, [track.path]);

  if (!confirming) {
    return (
      <div style={{ marginTop: "auto", paddingTop: 24 }}>
        <Button
          variant="destructive"
          icon="delete"
          style={{ width: "100%" }}
          onClick={() => setConfirming(true)}
        >
          Borrar archivo
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "auto",
        paddingTop: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 11.5, color: "var(--q-text-secondary)", lineHeight: 1.5 }}>
        Esto borra el archivo del disco y lo quita de todas las playlists. No se puede deshacer.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button
          variant="text"
          disabled={busy}
          style={{ flex: 1 }}
          onClick={() => setConfirming(false)}
        >
          Cancelar
        </Button>
        <Button
          variant="destructive"
          icon={busy ? "sync" : "delete"}
          disabled={busy}
          style={{ flex: 1 }}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete(track.path);
              // Tras borrar, el track desaparece de `tracks`; este panel queda
              // con `track: null` por el padre.
            } finally {
              // Si el borrado falló (el store lo captura y muestra el error),
              // el botón no puede quedar clavado en "Borrando…".
              setBusy(false);
            }
          }}
        >
          {busy ? "Borrando…" : "Borrar"}
        </Button>
      </div>
    </div>
  );
}

// ── Chip de membresía ─────────────────────────────────────────────────────────

