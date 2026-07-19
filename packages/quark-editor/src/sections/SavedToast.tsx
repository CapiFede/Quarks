import { useEffect } from "react";
import { Icon } from "@quarks/core";
import type { EditorStore } from "../store";

export interface SavedToastProps {
  store: EditorStore;
  path: string;
}

/** Aviso efímero tras guardar; se va solo a los pocos segundos. */
export function SavedToast({ store, path }: SavedToastProps) {
  useEffect(() => {
    const t = setTimeout(() => store.dismissSaved(), 3500);
    return () => clearTimeout(t);
  }, [store, path]);

  const name = path.split(/[\\/]/).pop() ?? path;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        gap: 8,
        maxWidth: "80%",
        padding: "9px 14px",
        background: "var(--q-surface)",
        border: "1px solid var(--q-border-light)",
        borderRadius: 9,
        boxShadow: "0 10px 28px rgba(0,0,0,.4)",
        fontSize: 12.5,
        color: "var(--q-text-primary)",
      }}
    >
      <Icon name="check_circle" size={17} color="var(--q-primary-light)" />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        Guardado: {name}
      </span>
    </div>
  );
}
