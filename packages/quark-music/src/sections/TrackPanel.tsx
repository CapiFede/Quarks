import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon, Button, TextInput } from "@quarks/core";
import type { Track } from "../types";
import { playlistRows, type PlaylistGroup } from "../store";
import { CHIPS_PER_ROW, fmtTime, RATING_MAX, ratingColor } from "../util";
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
  /** Mueve una playlist en la grilla de chips (ver `MusicStore.movePlaylist`). */
  onMovePlaylist: (playlistId: string, row: number, index: number | null) => void;
  onRename: (path: string, newName: string) => Promise<void> | void;
  onDelete: (path: string) => Promise<void> | void;
}

/** Panel lateral derecho (260px): cover editable, título editable, metadata
 * (con el puntaje editable), pertenencia a playlists (grilla por categoría,
 * acomodable arrastrando) y acciones (borrar). */
export const TrackPanel = memo(function TrackPanel({
  track,
  plays,
  rating,
  onRate,
  groups,
  onPlay,
  onEdit,
  onToggleInPlaylist,
  onMovePlaylist,
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
          // no flotando entre el contenido y el padding. Los 4px de la
          // izquierda son para que no se recorte la marca de destino al
          // arrastrar el primer chip de una fila.
          margin: "0 -18px 0 -4px",
          padding: "0 18px 18px 4px",
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
                <PlaylistChips
                  groups={groups}
                  trackPath={track.path}
                  onToggle={onToggleInPlaylist}
                  onMove={onMovePlaylist}
                />
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

// ── Grilla de chips de playlists ──────────────────────────────────────────────

/** Chip que se está arrastrando y su grupo. */
interface ChipDrag {
  id: string;
  group: string;
}

/**
 * Dónde caería el chip arrastrado: en la fila `row` antes del chip `index` (el
 * largo de la fila = al final) o, con `index` en `null`, en una fila nueva en
 * la posición `row`. Mismos argumentos que `MusicStore.movePlaylist`.
 */
interface ChipTarget {
  row: number;
  index: number | null;
}

/** Franja (px) de arriba y de abajo de cada fila que apunta a una fila nueva. */
const ROW_EDGE = 5;

/**
 * Chips de pertenencia en una grilla por categoría: filas de hasta
 * `CHIPS_PER_ROW` chips que, si no entran, se achican. Click agrega/quita el
 * track; arrastrar un chip lo mueve dentro de su grupo, a una fila con lugar o
 * a una fila nueva (drag & drop nativo, como los capítulos de Libros).
 */
function PlaylistChips({
  groups,
  trackPath,
  onToggle,
  onMove,
}: {
  groups: PlaylistGroup[];
  trackPath: string;
  onToggle: (playlistId: string, isIn: boolean) => void;
  onMove: (playlistId: string, row: number, index: number | null) => void;
}) {
  // Los handlers de drag corren antes de que React re-renderee: leen el ref;
  // el state alimenta el visual (lugares libres y marca de destino).
  const dragRef = useRef<ChipDrag | null>(null);
  const [drag, setDrag] = useState<ChipDrag | null>(null);
  const [mark, setMark] = useState<ChipTarget | null>(null);

  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
    setMark(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {groups.map((g) => {
        const group = g.category?.id ?? "loose";
        const rows = playlistRows(g.playlists);
        const dragging = drag?.group === group;
        const newRowMark = dragging && mark?.index === null ? mark.row : null;

        /** Destino bajo el cursor, o `null` si ahí no se puede soltar (otro grupo o fila llena). */
        const targetAt = (el: HTMLElement, x: number, y: number): ChipTarget | null => {
          const d = dragRef.current;
          if (d?.group !== group) return null;
          const rowEls = el.querySelectorAll<HTMLElement>("[data-chip-row]");
          for (let r = 0; r < rows.length; r++) {
            const rect = rowEls[r].getBoundingClientRect();
            if (y < rect.top + ROW_EDGE) return { row: r, index: null };
            if (y > rect.bottom - ROW_EDGE) continue;
            if (rows[r].length >= CHIPS_PER_ROW && !rows[r].some((p) => p.id === d.id)) return null;
            const index = [...rowEls[r].querySelectorAll<HTMLElement>("[data-chip]")].filter((c) => {
              const b = c.getBoundingClientRect();
              return b.left + b.width / 2 < x;
            }).length;
            return { row: r, index };
          }
          return { row: rows.length, index: null };
        };

        return (
          <div key={group}>
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
            <div
              onDragOver={(e) => {
                const t = targetAt(e.currentTarget, e.clientX, e.clientY);
                if (!t) {
                  setMark(null);
                  return;
                }
                e.preventDefault();
                setMark((m) => (m && m.row === t.row && m.index === t.index ? m : t));
              }}
              onDrop={(e) => {
                const d = dragRef.current;
                const t = targetAt(e.currentTarget, e.clientX, e.clientY);
                if (d && t) {
                  e.preventDefault();
                  onMove(d.id, t.row, t.index);
                }
                endDrag();
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                // Se estira sobre los márgenes vecinos (sin mover nada) para que
                // arriba de la primera fila y abajo de la última también se pueda
                // soltar en una fila nueva.
                padding: "5px 0",
                margin: "-5px 0",
              }}
            >
              {rows.map((row, r) => {
                const free = CHIPS_PER_ROW - row.length;
                const slot = dragging && mark?.row === r ? mark.index : null;
                return (
                  // La key cambia con lo que hay en la fila: así vuelve a medir
                  // si entra a tamaño normal.
                  <ChipRow
                    key={row.map((p) => p.id + p.name).join("\n")}
                    newRowMark={newRowMark === r}
                  >
                    {(compact) => (
                      <>
                        {row.map((p, i) => {
                          const isIn = p.trackPaths.includes(trackPath);
                          return (
                            <span
                              key={p.id}
                              data-chip=""
                              draggable
                              title={p.name}
                              onDragStart={(e) => {
                                const d = { id: p.id, group };
                                dragRef.current = d;
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", p.id);
                                // Los lugares libres cambian el layout: recién después
                                // de arrancar el drag, para no cortarlo.
                                setTimeout(() => {
                                  if (dragRef.current === d) setDrag(d);
                                });
                              }}
                              onDragEnd={endDrag}
                              style={{
                                position: "relative",
                                display: "flex",
                                // Si la fila no entra, se achica primero el chip más
                                // largo: todos crecen parejo desde 0 hasta su ancho
                                // natural, y los cortos quedan enteros.
                                flex: "1 1 0",
                                minWidth: 0,
                                maxWidth: "max-content",
                                opacity: drag?.id === p.id ? 0.4 : 1,
                              }}
                            >
                              <Chip
                                label={p.name}
                                active={isIn}
                                compact={compact}
                                onClick={() => onToggle(p.id, isIn)}
                              />
                              {slot === i && <DropBar side="left" />}
                              {slot === row.length && free === 0 && i === row.length - 1 && (
                                <DropBar side="right" />
                              )}
                            </span>
                          );
                        })}
                        {dragging &&
                          Array.from({ length: free }, (_, i) => (
                            <FreeSlot key={i} active={i === 0 && slot === row.length} />
                          ))}
                      </>
                    )}
                  </ChipRow>
                );
              })}
              {dragging && <FreeSlot active={newRowMark === rows.length} label="Nueva fila" />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Fila de la grilla. Si a tamaño normal algún nombre queda cortado, pasa sus
 * chips a `compact` antes de pintar; si ni así entran, se cortan con "…".
 * `newRowMark` dibuja la línea de "fila nueva acá" en el hueco de arriba.
 */
function ChipRow({
  newRowMark,
  children,
}: {
  newRowMark: boolean;
  children: (compact: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const labels = ref.current?.querySelectorAll<HTMLElement>("[data-chip-label]") ?? [];
    if ([...labels].some((l) => l.scrollWidth > l.clientWidth)) setCompact(true);
  }, []);

  return (
    <div
      ref={ref}
      data-chip-row=""
      style={{ position: "relative", display: "flex", gap: 6, minWidth: 0 }}
    >
      {children(compact)}
      {newRowMark && (
        <span
          style={{
            position: "absolute",
            top: -4,
            left: 0,
            right: 0,
            height: 2,
            borderRadius: 1,
            background: "var(--q-primary-light)",
          }}
        />
      )}
    </div>
  );
}

/** Marca de destino entre chips: barrita centrada en el hueco de 6px. */
function DropBar({ side }: { side: "left" | "right" }) {
  return (
    <span
      style={{
        position: "absolute",
        top: 2,
        bottom: 2,
        [side]: -4,
        width: 2,
        borderRadius: 1,
        background: "var(--q-primary-light)",
      }}
    />
  );
}

/** Lugar libre de la grilla mientras se arrastra: uno por chip que falta en la fila, o la fila nueva del final. */
function FreeSlot({ active, label }: { active: boolean; label?: string }) {
  return (
    <span
      style={{
        flex: label ? undefined : "0 0 24px",
        height: 24,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        border: `1px dashed ${active ? "var(--q-primary-light)" : "var(--q-border-light)"}`,
        borderRadius: 6,
        background: active ? "var(--q-primary-soft)" : "transparent",
        color: active ? "var(--q-primary-light)" : "var(--q-text-light)",
        fontSize: 10.5,
      }}
    >
      {label && (
        <>
          <Icon name="add" size={13} />
          {label}
        </>
      )}
    </span>
  );
}

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

