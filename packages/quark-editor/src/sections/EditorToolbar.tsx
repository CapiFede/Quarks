import { QuarkToolbar, IconButton, Icon } from "@quarks/core";
import type { EditorStore } from "../store";
import { useEditorState } from "../hooks/useEditorStore";

export interface EditorToolbarProps {
  store: EditorStore;
}

/**
 * Toolbar del editor. Izquierda: nombre del clip + botón para volver al selector.
 * Derecha: deshacer / rehacer / guardar. Sin clip cargado, solo el título.
 */
export function EditorToolbar({ store }: EditorToolbarProps) {
  const { source, canUndo, canRedo, segments, status } = useEditorState(store);
  const exporting = status === "exporting";
  const canSave = !!source && segments.length > 0 && !exporting;

  return (
    <QuarkToolbar
      left={
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, height: "100%" }}>
          {source ? (
            <>
              <IconButton name="arrow_back" tooltip="Volver al selector" onClick={() => store.closeSource()} />
              <Icon name={source.hasVideo ? "movie" : "music_note"} size={15} color="var(--q-text-secondary)" />
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--q-text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {source.name}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--q-text-secondary)" }}>
              Editor
            </span>
          )}
        </div>
      }
      right={
        source ? (
          <>
            <DimIconButton name="undo" tooltip="Deshacer (Ctrl+Z)" enabled={canUndo} onClick={() => store.undo()} />
            <DimIconButton name="redo" tooltip="Rehacer (Ctrl+Shift+Z)" enabled={canRedo} onClick={() => store.redo()} />
            <DimIconButton name="save" tooltip="Guardar" enabled={canSave} onClick={() => store.openSave()} />
          </>
        ) : null
      }
    />
  );
}

/** IconButton que se atenúa y no responde cuando está deshabilitado. */
function DimIconButton({
  name,
  tooltip,
  enabled,
  onClick,
}: {
  name: string;
  tooltip: string;
  enabled: boolean;
  onClick: () => void;
}) {
  return (
    <span style={{ opacity: enabled ? 1 : 0.35, display: "inline-flex" }}>
      <IconButton name={name} tooltip={tooltip} onClick={enabled ? onClick : undefined} />
    </span>
  );
}
