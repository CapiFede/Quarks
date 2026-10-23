import { useEffect, useRef, useState } from "react";
import { Button, Icon, IconButton } from "@quarks/core";

export interface CoverCropDialogProps {
  /** Imagen a encuadrar (data URL). */
  src: string;
  /** Guardando: botones deshabilitados, el diálogo no se cierra. */
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  /** Recibe la portada final (data URL). */
  onSave: (dataUrl: string) => void;
}

/** Tamaño máximo de la imagen en pantalla. */
const VIEW_W = 560;
const VIEW_H = 420;
/** Lado máximo de la portada resultante, en px: más es peso de más en el MP3. */
const OUT_MAX = 1200;
/** Zoom máximo: el cuadrado más chico es 1/ZOOM_MAX del lado corto. */
const ZOOM_MAX = 6;
/** Factor por click en los botones de zoom. */
const ZOOM_STEP = 1.25;

/** Cuadrado de recorte, en píxeles de la imagen original. */
interface Square {
  x: number;
  y: number;
  side: number;
}

/** Cómo se lleva la imagen a la portada cuadrada. */
type Mode = "crop" | "fit" | "stretch";

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "crop", label: "Recortar", hint: "Arrastrá el cuadro para encuadrar; la rueda hace zoom." },
  { value: "fit", label: "Entera", hint: "La imagen entera, con el fondo desenfocado." },
  { value: "stretch", label: "Estirar", hint: "La imagen entera, estirada hasta quedar cuadrada." },
];

/**
 * Editor de portada. Por defecto muestra la imagen entera con un cuadrado
 * encima que se arrastra para encuadrar (click afuera lo centra ahí) y se
 * achica/agranda con la rueda, el slider o los botones de zoom; lo de afuera
 * queda oscurecido. Si la imagen no es cuadrada, también se puede usar entera
 * (con bandas de fondo desenfocado) o estirada; ahí se ve la portada final.
 * Guardar la dibuja en un canvas y devuelve un JPEG; si el cuadrado abarca
 * toda una imagen ya cuadrada, devuelve la original sin recomprimir.
 */
export function CoverCropDialog({ src, busy, error, onCancel, onSave }: CoverCropDialogProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setImg(null);
    setLoadError(false);
    const im = new Image();
    im.onload = () => setImg(im);
    im.onerror = () => setLoadError(true);
    im.src = src;
  }, [src]);

  // Escape cancela. En captura y sin propagar: si no, también lo agarra el
  // Shell (cadena de Escape del quark).
  const live = useRef({ busy, onCancel });
  live.current = { busy, onCancel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (!live.current.busy) live.current.onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <div
      onClick={() => !busy && onCancel()}
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
          minWidth: 420,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="crop" size={18} color="var(--q-primary-light)" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Ajustar portada</div>
          {!busy && <IconButton name="close" tooltip="Cerrar" onClick={onCancel} />}
        </div>

        {img ? (
          <Editor img={img} src={src} busy={busy} error={error} onCancel={onCancel} onSave={onSave} />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "28px 0",
              fontSize: 12.5,
              color: loadError ? "var(--q-error)" : "var(--q-text-secondary)",
            }}
          >
            <Icon
              name={loadError ? "error" : "sync"}
              size={20}
              color={loadError ? "var(--q-error)" : "var(--q-text-light)"}
            />
            {loadError ? "No se pudo leer la imagen." : "Cargando la imagen…"}
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({
  img,
  src,
  busy,
  error,
  onCancel,
  onSave,
}: Omit<CoverCropDialogProps, "src"> & { img: HTMLImageElement; src: string }) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const minDim = Math.min(w, h);
  const maxW = Math.min(VIEW_W, window.innerWidth - 88);
  /** px de pantalla por px de imagen. */
  const scale = Math.min(maxW / w, VIEW_H / h);
  /** Lado de la vista previa de "Entera"/"Estirar": el alto de la imagen en
   * pantalla, para que el diálogo no salte al cambiar de modo. */
  const previewSide = Math.min(h * scale, maxW);

  const [mode, setMode] = useState<Mode>("crop");

  // Arranca con el cuadrado más grande posible, centrado.
  const [sq, setSq] = useState<Square>(() => ({
    x: (w - minDim) / 2,
    y: (h - minDim) / 2,
    side: minDim,
  }));
  const zoom = minDim / sq.side;

  const clamp = (s: Square): Square => ({
    side: s.side,
    x: Math.max(0, Math.min(w - s.side, s.x)),
    y: Math.max(0, Math.min(h - s.side, s.y)),
  });

  /** Cambia el tamaño del cuadrado manteniendo su centro (lo que entre). */
  const resize = (s: Square, z: number): Square => {
    const side = minDim / Math.max(1, Math.min(ZOOM_MAX, z));
    return clamp({ side, x: s.x + (s.side - side) / 2, y: s.y + (s.side - side) / 2 });
  };

  // Rueda = zoom. Listener nativo para poder hacer `preventDefault`. Depende
  // del modo porque la caja se desmonta fuera de "Recortar".
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.002);
      setSq((s) => resize(s, (minDim / s.side) * factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [img, mode]);

  // Vista previa de la portada final en los modos sin cuadrado.
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    if (mode === "crop" || !canvas) return;
    drawCover(canvas, img, mode, sq, Math.round(previewSide * window.devicePixelRatio));
  }, [img, mode, previewSide]);

  /** Offset del puntero a la esquina del cuadrado durante el arrastre. */
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const toImage = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    const p = toImage(e);
    let s = sq;
    const inside = p.x >= s.x && p.x <= s.x + s.side && p.y >= s.y && p.y <= s.y + s.side;
    if (!inside) {
      s = clamp({ ...s, x: p.x - s.side / 2, y: p.y - s.side / 2 });
      setSq(s);
    }
    drag.current = { dx: p.x - s.x, dy: p.y - s.y };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toImage(e);
    setSq((s) => clamp({ ...s, x: p.x - d.dx, y: p.y - d.dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Entera/estirada conserva el detalle del lado largo.
  const outSide = Math.round(Math.min(mode === "crop" ? sq.side : Math.max(w, h), OUT_MAX));

  const save = () => {
    if (mode === "crop" && w === h && sq.side >= minDim - 0.5) return onSave(src);
    const canvas = document.createElement("canvas");
    if (!drawCover(canvas, img, mode, sq, outSide)) return;
    onSave(canvas.toDataURL("image/jpeg", 0.92));
  };

  /** Oculta (sin sacar del layout) los controles de zoom fuera de "Recortar". */
  const zoomStyle: React.CSSProperties = mode === "crop" ? {} : { visibility: "hidden" };

  return (
    <>
      {w !== h && <ModePicker value={mode} onChange={setMode} disabled={busy} />}

      {/* Tamaño fijo entre modos, para que el diálogo no cambie de ancho. */}
      <div
        style={{
          alignSelf: "center",
          width: Math.max(w * scale, previewSide),
          height: h * scale,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {mode === "crop" ? (
          <div
            ref={boxRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              position: "relative",
              width: w * scale,
              height: h * scale,
              overflow: "hidden",
              borderRadius: 4,
              cursor: dragging ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
            }}
          >
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
            />
            <div
              style={{
                position: "absolute",
                left: sq.x * scale,
                top: sq.y * scale,
                width: sq.side * scale,
                height: sq.side * scale,
                // La sombra gigante oscurece todo lo que queda afuera del cuadrado.
                boxShadow: "0 0 0 9999px rgba(0,0,0,.55)",
                outline: "1.5px solid rgba(255,255,255,.9)",
                pointerEvents: "none",
              }}
            >
              {/* Tercios, para ayudar a encuadrar. */}
              {[1, 2].map((i) => (
                <div key={i}>
                  <div style={{ ...THIRD, left: `${(i * 100) / 3}%`, top: 0, bottom: 0, width: 1 }} />
                  <div style={{ ...THIRD, top: `${(i * 100) / 3}%`, left: 0, right: 0, height: 1 }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <canvas
            ref={previewRef}
            style={{ width: previewSide, height: previewSide, borderRadius: 4, display: "block" }}
          />
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <IconButton
          name="zoom_out"
          tooltip="Alejar"
          onClick={() => setSq((s) => resize(s, zoom / ZOOM_STEP))}
          style={zoomStyle}
        />
        <input
          type="range"
          min={1}
          max={ZOOM_MAX}
          step={0.01}
          value={zoom}
          disabled={busy}
          onChange={(e) => setSq((s) => resize(s, Number(e.target.value)))}
          style={{ flex: 1, accentColor: "var(--q-primary-light)", cursor: "pointer", ...zoomStyle }}
        />
        <IconButton
          name="zoom_in"
          tooltip="Acercar"
          onClick={() => setSq((s) => resize(s, zoom * ZOOM_STEP))}
          style={zoomStyle}
        />
        <span
          style={{
            minWidth: 92,
            textAlign: "right",
            fontSize: 11.5,
            fontFamily: "var(--q-font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--q-text-light)",
          }}
        >
          {outSide} × {outSide} px
        </span>
      </div>

      {error && <div style={{ fontSize: 11.5, color: "var(--q-error)", wordBreak: "break-word" }}>{error}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "var(--q-text-light)" }}>
          {MODES.find((m) => m.value === mode)?.hint}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <Button variant="text" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="filled" icon={busy ? "sync" : "save"} disabled={busy} onClick={save}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </span>
      </div>
    </>
  );
}

/**
 * Dibuja la portada final en `canvas`, cuadrada de `out` px: el recorte `sq`,
 * la imagen entera sobre un fondo desenfocado, o la imagen estirada.
 */
function drawCover(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  mode: Mode,
  sq: Square,
  out: number,
): boolean {
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.imageSmoothingQuality = "high";
  if (mode === "crop") {
    ctx.drawImage(img, sq.x, sq.y, sq.side, sq.side, 0, 0, out, out);
  } else if (mode === "stretch") {
    ctx.drawImage(img, 0, 0, out, out);
  } else {
    // Fondo: la imagen estirada y desenfocada (así sus colores siguen los
    // bordes de la imagen), un poco oscurecida para que la imagen resalte.
    ctx.drawImage(blurred(img), 0, 0, out, out);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.fillRect(0, 0, out, out);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const k = out / Math.max(w, h);
    ctx.drawImage(img, (out - w * k) / 2, (out - h * k) / 2, w * k, h * k);
  }
  return true;
}

/** Lado del canvas chico donde se desenfoca el fondo de "Entera". */
const BLUR_SIZE = 64;
const BLUR_RADIUS = 5;

/**
 * La imagen estirada a un cuadrado chico y desenfocada: tres pasadas de box
 * blur por eje (≈ gaussiano), a mano porque WebKitGTK no implementa
 * `ctx.filter`. Agrandada a la portada queda un fondo liso.
 */
function blurred(img: HTMLImageElement): HTMLCanvasElement {
  const n = BLUR_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0, n, n);
  const data = ctx.getImageData(0, 0, n, n);
  const a = data.data;
  const b = new Uint8ClampedArray(a.length);
  const at = (x: number, y: number) => (y * n + x) * 4;
  const clampN = (v: number) => (v < 0 ? 0 : v >= n ? n - 1 : v);
  /** Una pasada de `src` a `dst`, horizontal o vertical, con bordes extendidos. */
  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let k = -BLUR_RADIUS; k <= BLUR_RADIUS; k++) {
            const i = horizontal ? at(clampN(x + k), y) : at(x, clampN(y + k));
            sum += src[i + c];
          }
          dst[at(x, y) + c] = sum / (2 * BLUR_RADIUS + 1);
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(a, b, true);
    pass(b, a, false);
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function ModePicker({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        alignSelf: "center",
        width: 300,
        display: "flex",
        gap: 2,
        padding: 2,
        background: "var(--q-background)",
        border: "1px solid var(--q-border)",
        borderRadius: 6,
      }}
    >
      {MODES.map((m) => {
        const active = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m.value)}
            style={{
              flex: 1,
              appearance: "none",
              border: "none",
              borderRadius: 4,
              padding: "5px 0",
              cursor: "default",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              fontFamily: "var(--q-font-sans)",
              color: active ? "var(--q-on-primary, #fff)" : "var(--q-text-secondary)",
              background: active ? "var(--q-primary)" : "transparent",
              transition: "background var(--q-dur-fast) var(--q-ease)",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

const THIRD: React.CSSProperties = {
  position: "absolute",
  background: "rgba(255,255,255,.3)",
};
