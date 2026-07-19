import type { ReactNode } from "react";
import { isAndroid } from "../../services/platform";

/**
 * Marco de la ventana.
 *
 * En desktop: borde redondeado 8px + sombra (decoraciones nativas están off
 * en `tauri.conf.json`, lo dibuja el frame).
 * En Android: full-bleed sin decoraciones. Dos franjas explícitas para las
 * safe areas:
 *   - Arriba: pintada con `--q-titlebar-bg` para que el cutout/status bar
 *     se vea como una extensión continua de la titlebar (sin escalón de color).
 *   - Abajo: con el color del cuerpo, para la barra de gestos.
 */
export function WindowFrame({ children }: { children: ReactNode }) {
  if (isAndroid) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--q-background)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Franja superior teñida color titlebar; cubre la zona de status bar
            y cutout del teléfono. El fallback aplica si el WebView no expone
            la env var (raro, pero conserva al menos un margen razonable). */}
        <div
          aria-hidden
          style={{
            flex: "0 0 auto",
            height: "env(safe-area-inset-top, 28px)",
            background: "var(--q-titlebar-bg)",
          }}
        />
        {children}
        <div
          aria-hidden
          style={{
            flex: "0 0 auto",
            height: "env(safe-area-inset-bottom, 0px)",
            background: "var(--q-background)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--q-background)",
        border: "1px solid var(--q-border-dark)",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 8px 32px rgba(0,0,0,.35)",
      }}
    >
      {children}
    </div>
  );
}
