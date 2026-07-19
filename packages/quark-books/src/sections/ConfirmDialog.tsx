import { useEffect } from "react";
import { Button, Icon } from "@quarks/core";

export interface ConfirmDialogProps {
  /** Título corto del diálogo. */
  title: string;
  /** Cuerpo explicativo (qué pasa al confirmar). */
  message: string;
  /** Texto del botón de confirmación. Default "Confirmar". */
  confirmLabel?: string;
  /** Pinta el botón de confirmación como acción peligrosa (rojo). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación in-app. Reemplaza al `window.confirm` nativo, que en
 * Tauri mapea al comando `dialog.confirm` (no habilitado en las capabilities y
 * por eso tiraba "dialog.confirm not allowed"). Overlay `fixed` que cubre la
 * ventana del quark, mismo molde visual que `DownloadDialog` del quark música.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc cancela, Enter confirma.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      else if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      onClick={onCancel}
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
          width: 380,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon
            name={destructive ? "warning" : "help"}
            size={18}
            color={destructive ? "var(--q-error)" : "var(--q-primary-light)"}
          />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--q-text-secondary)", lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="text" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant={destructive ? "destructive" : "filled"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
