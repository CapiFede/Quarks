import { useEffect } from "react";
import { Button, Icon } from "@quarks/core";
import type { EditorStore } from "../store";
import { useEditorState } from "../hooks/useEditorStore";
import { Picker } from "./Picker";
import { Preview } from "./Preview";
import { Timeline } from "./Timeline";
import { SaveDialog } from "./SaveDialog";
import { SavedToast } from "./SavedToast";

export interface EditorPageProps {
  store: EditorStore;
}

/** Única pantalla del editor: selector si no hay clip, editor si lo hay. */
export function EditorPage({ store }: EditorPageProps) {
  const state = useEditorState(store);
  const { source } = state;

  // Atajos de teclado del editor (mientras la página está montada).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        store.redo();
      } else if (!meta && (e.key === "x" || e.key === "X") && source) {
        // Cortar: con selección la quita; sin selección parte donde está el mouse.
        e.preventDefault();
        store.cutAtCursorOrSelection();
      } else if (!meta && (e.key === "Delete" || e.key === "Backspace") && source) {
        e.preventDefault();
        store.removeSelection();
      } else if (!meta && (e.key === "q" || e.key === "Q") && source) {
        // Alternar modo mover-playhead ↔ seleccionar.
        e.preventDefault();
        store.toggleMode();
      } else if (e.key === " " && source) {
        // Evitar que la barra espaciadora scrollee; togglea play.
        e.preventDefault();
        store.togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, source]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
      {source ? <EditorView store={store} /> : <Picker store={store} />}
      {state.saveOpen && <SaveDialog store={store} />}
      {state.savedPath && <SavedToast store={store} path={state.savedPath} />}
    </div>
  );
}

function EditorView({ store }: { store: EditorStore }) {
  const state = useEditorState(store);
  const { selection, segments, status, mode } = state;
  const hasSelection = !!selection && Math.abs(selection.end - selection.start) > 0.01;
  const canSave = segments.length > 0 && status !== "exporting";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Preview store={store} />
      <Timeline store={store} />

      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px 14px",
        }}
      >
        <ModePill mode={mode} onClick={() => store.toggleMode()} />

        <span style={{ flex: 1, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--q-text-secondary)" }}>
          {mode === "select" ? (
            hasSelection ? (
              <>
                <Kbd>Backspace</Kbd> borra la sección
                <span onClick={() => store.clearSelection()} style={{ color: "var(--q-text-light)", cursor: "default", marginLeft: 8 }}>
                  Cancelar
                </span>
              </>
            ) : (
              <>Click una sección (o arrastrá un tramo) para seleccionarla</>
            )
          ) : (
            <>
              Click mueve la línea · <Kbd>X</Kbd> parte donde está el mouse
            </>
          )}
        </span>

        <Button icon="save" variant="filled" disabled={!canSave} onClick={() => store.openSave()}>
          Guardar
        </Button>
      </div>
    </div>
  );
}

/** Indicador/conmutador de modo (también se alterna con la tecla Q). */
function ModePill({ mode, onClick }: { mode: "move" | "select"; onClick: () => void }) {
  const select = mode === "select";
  return (
    <span
      onClick={onClick}
      title="Cambiar modo (Q)"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px",
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 600,
        cursor: "default",
        whiteSpace: "nowrap",
        color: select ? "var(--q-primary-light)" : "var(--q-text-secondary)",
        background: select ? "var(--q-primary-soft)" : "var(--q-surface-alt)",
        border: "1px solid var(--q-border)",
      }}
    >
      <Icon name={select ? "highlight_alt" : "pan_tool_alt"} size={15} />
      {select ? "Seleccionar" : "Mover"}
      <Kbd>Q</Kbd>
    </span>
  );
}

/** Tecla estilizada para los hints. */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        fontSize: 11,
        fontFamily: "var(--q-font-mono)",
        fontWeight: 600,
        color: "var(--q-text-primary)",
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border)",
        borderRadius: 4,
      }}
    >
      {children}
    </kbd>
  );
}
