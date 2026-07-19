import { Icon } from "@quarks/core";
import type { EditorStore } from "../store";
import { useEditorState } from "../hooks/useEditorStore";
import { keptDuration } from "../store";
import { fmtTime } from "../util";

export interface SaveDialogProps {
  store: EditorStore;
}

/**
 * Diálogo de guardado: el usuario elige cada vez entre guardar una copia nueva
 * o sobrescribir el original (ver decisión de diseño del quark).
 */
export function SaveDialog({ store }: SaveDialogProps) {
  const { source, segments, status } = useEditorState(store);
  const exporting = status === "exporting";
  if (!source) return null;

  const edited = keptDuration(segments);
  const isMusic = source.origin === "music";

  return (
    <Overlay onClose={() => !exporting && store.closeSave()}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 380,
          padding: 18,
          background: "var(--q-surface)",
          border: "1px solid var(--q-border-light)",
          borderRadius: 12,
          boxShadow: "0 18px 50px rgba(0,0,0,.45)",
        }}
      >
        <h3 style={{ margin: "0 0 4px", fontSize: 14.5, color: "var(--q-text-primary)" }}>
          Guardar edición
        </h3>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "var(--q-text-secondary)" }}>
          {source.name} · queda {fmtTime(edited)} de {fmtTime(source.durationSec)}
        </p>

        {exporting ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 4px",
              fontSize: 13,
              color: "var(--q-text-secondary)",
            }}
          >
            <Icon name="hourglass_top" size={18} />
            Exportando con ffmpeg…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Choice
              icon="library_add"
              title="Guardar como copia nueva"
              subtitle={
                isMusic
                  ? "Crea una canción nueva en Música, sin tocar el original."
                  : "Elegís dónde guardar el archivo nuevo."
              }
              onClick={() => void store.exportClip("new")}
            />
            <Choice
              icon="save"
              title="Sobrescribir original"
              subtitle={
                isMusic
                  ? "Reemplaza la canción en Música. No se puede deshacer."
                  : "Reemplaza el archivo importado. No se puede deshacer."
              }
              danger
              onClick={() => void store.exportClip("overwrite")}
            />
          </div>
        )}

        {!exporting && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
            <span
              onClick={() => store.closeSave()}
              style={{ fontSize: 12.5, color: "var(--q-text-secondary)", cursor: "default", padding: "6px 8px" }}
            >
              Cancelar
            </span>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function Choice({
  icon,
  title,
  subtitle,
  danger,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "11px 12px",
        borderRadius: 8,
        cursor: "default",
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border)",
      }}
    >
      <Icon name={icon} size={20} color={danger ? "var(--q-danger, #e5484d)" : "var(--q-primary-light)"} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--q-text-primary)" }}>{title}</span>
        <span style={{ fontSize: 11.5, color: "var(--q-text-secondary)" }}>{subtitle}</span>
      </div>
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.42)",
      }}
    >
      {children}
    </div>
  );
}
