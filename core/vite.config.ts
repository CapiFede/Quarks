import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

// @tauri-apps/cli inyecta TAURI_DEV_HOST cuando corre en una red/dispositivo.
const host = process.env.TAURI_DEV_HOST;
const coreRoot = fileURLToPath(new URL(".", import.meta.url));

// La versión que se muestra en "Acerca de" sale de core/package.json. El script
// de release (scripts/release.mjs) lo bumpea junto con tauri.conf.json — así
// hay una sola fuente de verdad y el código React no se toca cada release.
const pkgVersion = JSON.parse(
  readFileSync(resolve(coreRoot, "package.json"), "utf8"),
).version as string;

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],

  resolve: {
    // Los quarks se bundlean desde su fuente (no se publican). El core importa
    // la instancia del quark por `@quarks/<id>`, y el quark importa la
    // superficie pública del core por `@quarks/core`. (Mantener en sync con los
    // `paths` de `tsconfig.base.json`.)
    alias: {
      "@quarks/core": resolve(coreRoot, "src/quark/index.ts"),
      "@quarks/quark-music": resolve(
        coreRoot,
        "../packages/quark-music/src/index.ts",
      ),
      "@quarks/quark-books": resolve(
        coreRoot,
        "../packages/quark-books/src/index.ts",
      ),
      "@quarks/quark-notes": resolve(
        coreRoot,
        "../packages/quark-notes/src/index.ts",
      ),
      "@quarks/quark-utils": resolve(
        coreRoot,
        "../packages/quark-utils/src/index.ts",
      ),
    },
    // Una sola copia de React aunque el quark declare su propia dependencia,
    // si no los hooks rompen ("invalid hook call").
    dedupe: ["react", "react-dom"],
    // Por defecto Vite resuelve `.js` ANTES que `.tsx`/`.ts`. En este monorepo
    // el código fuente es TS puro, así que invertimos el orden: si alguna vez
    // queda un `.js` derivado al lado de su gemelo `.tsx` (un `tsc` accidental
    // sin `--noEmit`), el resolver sigue eligiendo la fuente correcta.
    extensions: [".tsx", ".ts", ".mjs", ".js", ".jsx", ".json"],
  },

  // Tauri espera un puerto fijo y falla si no está disponible.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // No vigilar el backend Rust.
      ignored: ["**/src-tauri/**"],
    },
  },

  // Variables de entorno expuestas al frontend.
  envPrefix: ["VITE_", "TAURI_ENV_*"],

  // Constantes reemplazadas en build time. `__APP_VERSION__` lo lee Settings
  // → Acerca de; mantener acá evita hardcodear la versión en código React.
  define: {
    __APP_VERSION__: JSON.stringify(pkgVersion),
  },
});
