import { Component, type ErrorInfo, type ReactNode } from "react";
import { WindowFrame } from "./WindowFrame";
import { report } from "../../services/log";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Atrapa errores de render del árbol de React (que ni try/catch ni los handlers
 * de `window` ven) y los rutea al sink único. En vez de dejar la ventana en
 * blanco, muestra un fallback sobrio dentro del marco.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    report("render", error);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <WindowFrame>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--q-space-4)",
            padding: "var(--q-space-12)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "var(--q-fs-15)", color: "var(--q-error)" }}>
            Algo se rompió
          </div>
          <div style={{ fontSize: "var(--q-fs-12)", color: "var(--q-text-secondary)" }}>
            {error.message}
          </div>
          <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-text-light)" }}>
            Revisá la consola o el detalle del error.
          </div>
        </div>
      </WindowFrame>
    );
  }
}
