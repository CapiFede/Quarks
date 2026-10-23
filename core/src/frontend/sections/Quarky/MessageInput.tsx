/**
 * Input del chat. Textarea que crece automáticamente hasta MAX_ROWS líneas a
 * medida que el usuario tipea, y recién entonces pasa a scroll. Enter envía,
 * Shift+Enter salto de línea.
 *
 * Auto-grow: `useLayoutEffect` mide `scrollHeight` con la height seteada a
 * `auto` (deja al browser calcular el alto natural), luego cappea contra
 * `MAX_HEIGHT_PX` y lo aplica de vuelta. Pasa antes del paint para que el
 * usuario no vea un flicker entre tamaños.
 *
 * Adjuntar imágenes: se pueden pegar con Ctrl+V (screenshot del portapapeles) o
 * elegir con el botón de la izquierda. Cada imagen se guarda como data URL
 * base64 y viaja con el mensaje (requiere un modelo con visión). El pegado de
 * texto normal sigue funcionando: solo interceptamos el paste si trae imágenes.
 */
import {
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { Icon } from "../../components/Icon";

const MAX_ROWS = 5;
// font-size 13 * line-height 1.5 ≈ 19.5 px/línea. Suma 1 px de holgura para
// que la 5ta línea no quede recortada por el cap del scroll.
const MAX_HEIGHT_PX = Math.round(13 * 1.5 * MAX_ROWS + 1);

/** Lee un File de imagen a un data URL base64 (`data:image/png;base64,…`). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Fallback para leer una imagen del portapapeles del SO vía el plugin de Tauri.
 * Necesario en Linux: el WebView (WebKitGTK) no expone imágenes en el evento
 * `paste`, así que el `clipboardData` viene vacío. Acá vamos por el lado nativo,
 * reconstruimos los píxeles RGBA en un canvas y exportamos un PNG data URL.
 * Devuelve `null` si no hay imagen, si falla, o si no corremos dentro de Tauri.
 */
async function readClipboardImageDataUrl(): Promise<string | null> {
  try {
    const { readImage } = await import("@tauri-apps/plugin-clipboard-manager");
    const img = await readImage();
    const { width, height } = await img.size();
    const rgba = await img.rgba();
    if (!width || !height) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    // No hay imagen en el portapapeles, o no estamos en Tauri. No es un error.
    return null;
  }
}

export function MessageInput() {
  const { sendMessage, stop, status } = useQuarky();
  const [value, setValue] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const sending = status === "sending";

  // Auto-grow: recalculamos el height cada vez que cambia `value`. El truco de
  // `height = auto` es necesario para que `scrollHeight` refleje el alto real
  // del contenido y no quede congelado en el height anterior.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, MAX_HEIGHT_PX);
    ta.style.height = `${next}px`;
  }, [value]);

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    const urls = await Promise.all(imgs.map(fileToDataUrl));
    setImages((prev) => [...prev, ...urls]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    const text = value.trim();
    if ((!text && images.length === 0) || sending) return;
    const imgs = images;
    setValue("");
    setImages([]);
    // No await: el panel queda libre para que el usuario escriba el próximo
    // mientras el modelo responde. Los errores los muestra MessageList vía status.
    void sendMessage(text, imgs);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Pegar: si el portapapeles trae imágenes (p. ej. una screenshot), las
  // adjuntamos y cortamos el pegado por defecto. Si solo trae texto, dejamos que
  // el textarea lo pegue normalmente (no llamamos preventDefault).
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = e.clipboardData;
    // Camino 1: el WebView expone la imagen en el evento (macOS/Windows).
    const files = Array.from(data?.items ?? [])
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
      return;
    }
    // Si hay texto, es un pegado de texto normal: lo dejamos pasar.
    if (data?.getData("text/plain")) return;
    // Camino 2 (Linux/WebKitGTK): el evento vino vacío. Puede ser una imagen que
    // el WebView no expone; vamos por el clipboard nativo de Tauri. Cortamos el
    // default porque no hay texto que pegar de todos modos.
    e.preventDefault();
    void (async () => {
      const url = await readClipboardImageDataUrl();
      if (url) setImages((prev) => [...prev, url]);
    })();
  };

  const canSend = (value.trim().length > 0 || images.length > 0) && !sending;

  return (
    <div
      style={{
        flex: "0 0 auto",
        padding: "10px 12px 12px",
        background: "var(--q-surface)",
      }}
    >
      {images.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {images.map((src, i) => (
            <Thumb key={i} src={src} onRemove={() => removeImage(i)} />
          ))}
        </div>
      )}
      {/* `alignItems: center` centra verticalmente el placeholder cuando el
          textarea está en su estado de 1 línea (sin esto, queda pegado al fondo
          por culpa del send button de 32px). En multi-línea el botón queda
          centrado contra el textarea crecido — aceptable visualmente. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 8px 8px 8px",
          background: "var(--q-surface-alt)",
          border: "1px solid var(--q-border)",
          borderRadius: 10,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            // Reset para poder volver a elegir el mismo archivo.
            e.target.value = "";
          }}
        />
        <AttachButton onClick={() => fileRef.current?.click()} disabled={sending} />
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          rows={1}
          placeholder={sending ? "Esperando respuesta…" : "Mensaje a Quarky…"}
          disabled={sending}
          style={{
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "var(--q-text-primary)",
            fontFamily: "var(--q-font-sans)",
            fontSize: "var(--q-fs-13)",
            lineHeight: "var(--q-lh-relaxed)",
            maxHeight: `${MAX_HEIGHT_PX}px`,
            // Sin overflow-y por default: el `useLayoutEffect` setea height
            // EXACTO así no aparece scrollbar hasta llegar al cap. Una vez en
            // el cap, scrollHeight > MAX_HEIGHT_PX y el browser lo activa solo.
            overflowY: "auto",
            padding: 0,
            // `display: block` para que el textarea no se trate como inline (que
            // metería un descender baseline desalineando el placeholder).
            display: "block",
          }}
        />
        {sending ? (
          <StopButton onClick={stop} />
        ) : (
          <SendButton onClick={submit} disabled={!canSend} />
        )}
      </div>
    </div>
  );
}

/** Miniatura de una imagen adjunta, con botón para quitarla. */
function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <div
      style={{
        position: "relative",
        width: 56,
        height: 56,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid var(--q-border)",
      }}
    >
      <img
        src={src}
        alt="adjunto"
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      <span
        onClick={onRemove}
        title="Quitar"
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          width: 18,
          height: 18,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 9,
          background: "rgba(0,0,0,0.55)",
          color: "#fff",
          cursor: "default",
        }}
      >
        <Icon name="close" size={12} />
      </span>
    </div>
  );
}

function AttachButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      title="Adjuntar imagen"
      style={{
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        color: disabled ? "var(--q-text-light)" : "var(--q-text-secondary)",
        cursor: disabled ? "default" : "default",
        opacity: disabled ? 0.6 : 1,
        flex: "0 0 auto",
      }}
    >
      <Icon name="image" size={18} />
    </span>
  );
}

const actionButtonStyle = {
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  cursor: "default",
  flex: "0 0 auto",
  transition: "background var(--q-dur-fast) var(--q-ease)",
} as const;

function SendButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      title="Enviar (Enter)"
      style={{
        ...actionButtonStyle,
        background: disabled ? "var(--q-card-hover)" : "var(--q-primary)",
        color: disabled ? "var(--q-text-light)" : "#fff",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon name="arrow_upward" size={18} />
    </span>
  );
}

/** Reemplaza al botón de enviar mientras el modelo responde. */
function StopButton({ onClick }: { onClick: () => void }) {
  return (
    <span
      onClick={onClick}
      title="Frenar la respuesta"
      style={{ ...actionButtonStyle, background: "var(--q-surface-alt)", color: "var(--q-text-primary)" }}
    >
      <Icon name="stop" size={18} fill={1} />
    </span>
  );
}
