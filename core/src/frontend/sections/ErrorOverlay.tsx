import { useEffect, useRef, useState } from "react";
import { report, subscribe, type ErrorEntry } from "../../services/log";

interface Item {
  id: number;
  entry: ErrorEntry;
}

/**
 * Tope de errores retenidos: si algo spamea `report` (un loop reportando cada
 * tick), el array no debe crecer sin techo — cada entrada arrastra su stack.
 * Conservamos solo los más recientes (van al frente).
 */
const MAX_ITEMS = 50;

/** Texto plano del error para el portapapeles: `[scope] mensaje` + stack. */
function textOf(entry: ErrorEntry): string {
  const head = entry.scope ? `[${entry.scope}] ${entry.message}` : entry.message;
  return entry.stack ? `${head}\n\n${entry.stack}` : head;
}

/**
 * Popup de debug: se suscribe al sink y muestra, encima de todo, los detalles
 * de cada error reportado (scope, mensaje y stack). Pensado para debuggear.
 * No renderiza nada cuando no hay errores. Vive fuera del ErrorBoundary, así
 * sigue visible aunque el árbol de la app caiga en el fallback.
 */
export function ErrorOverlay() {
  const [items, setItems] = useState<Item[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const nextId = useRef(0);

  useEffect(() => {
    return subscribe((entry) => {
      setItems((prev) => [{ id: nextId.current++, entry }, ...prev].slice(0, MAX_ITEMS));
    });
  }, []);

  if (items.length === 0) return null;

  const dismiss = (id: number) => setItems((prev) => prev.filter((it) => it.id !== id));

  const copy = (id: number, entry: ErrorEntry) => {
    navigator.clipboard.writeText(textOf(entry)).then(
      () => {
        setCopiedId(id);
        setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200);
      },
      (e: unknown) => report("errorOverlay.copy", e),
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        right: "var(--q-space-6)",
        bottom: "var(--q-space-6)",
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: "var(--q-space-3)",
        maxWidth: 420,
        maxHeight: "70vh",
        overflowY: "auto",
        fontFamily: "var(--q-font-sans)",
      }}
    >
      {items.length > 1 && (
        <button
          type="button"
          onClick={() => setItems([])}
          style={{
            alignSelf: "flex-end",
            cursor: "pointer",
            border: "1px solid var(--q-border-dark)",
            background: "var(--q-surface-alt)",
            color: "var(--q-text-secondary)",
            fontSize: "var(--q-fs-11)",
            padding: "2px 8px",
            borderRadius: "var(--q-radius-3)",
          }}
        >
          Limpiar todo ({items.length})
        </button>
      )}

      {items.map(({ id, entry }) => (
        <div
          key={id}
          style={{
            background: "var(--q-surface)",
            border: "1px solid var(--q-error)",
            borderRadius: "var(--q-radius-4)",
            boxShadow: "0 6px 24px rgba(0,0,0,.4)",
            padding: "var(--q-space-5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--q-space-3)",
              marginBottom: "var(--q-space-3)",
            }}
          >
            <span
              style={{
                fontSize: "var(--q-fs-10)",
                fontWeight: "var(--q-fw-semibold)",
                letterSpacing: "var(--q-ls-caps)",
                textTransform: "uppercase",
                color: "var(--q-error)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.scope ?? "error"}
            </span>
            <button
              type="button"
              onClick={() => copy(id, entry)}
              style={{
                cursor: "pointer",
                border: "1px solid var(--q-border-dark)",
                background: "var(--q-surface-alt)",
                color: copiedId === id ? "var(--q-success)" : "var(--q-text-secondary)",
                fontSize: "var(--q-fs-10)",
                lineHeight: 1,
                padding: "3px 7px",
                borderRadius: "var(--q-radius-3)",
              }}
            >
              {copiedId === id ? "Copiado" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={() => dismiss(id)}
              aria-label="Cerrar"
              style={{
                cursor: "pointer",
                border: "none",
                background: "transparent",
                color: "var(--q-text-secondary)",
                fontSize: "var(--q-fs-13)",
                lineHeight: 1,
                padding: 0,
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              fontSize: "var(--q-fs-12)",
              color: "var(--q-text-primary)",
              marginBottom: entry.stack ? "var(--q-space-3)" : 0,
              wordBreak: "break-word",
            }}
          >
            {entry.message}
          </div>

          {entry.stack && (
            <pre
              style={{
                margin: 0,
                maxHeight: 160,
                overflow: "auto",
                fontFamily: "var(--q-font-mono)",
                fontSize: "var(--q-fs-10)",
                color: "var(--q-text-light)",
                background: "var(--q-titlebar-bg)",
                border: "1px solid var(--q-border-dark)",
                borderRadius: "var(--q-radius-2)",
                padding: "var(--q-space-3)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {entry.stack}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
