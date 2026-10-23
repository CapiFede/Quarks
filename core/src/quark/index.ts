/**
 * Superficie pública que consumen los quarks (`@quarks/core`).
 *
 * Un quark importa de acá TODO lo que necesita del core y nada más: su contrato
 * (`Quark`, `AiContext`), las APIs transversales y las piezas de UI compartidas.
 * No debe alcanzar a archivos internos del core por ruta relativa: este módulo
 * es el límite. El alias `@quarks/core` (ver `core/vite.config.ts` y
 * `tsconfig.base.json`) apunta acá.
 */

// ── Contrato ──────────────────────────────────────────────────────────────────
export type { Quark, AiContext, AiAttachment, LegacySpace } from "./types";

// ── Plataforma ────────────────────────────────────────────────────────────────
// Para que los quarks gateen UI/IO mobile-only vs desktop-only.
export { isAndroid, isDesktop, isLinux } from "../services/platform";
// Tareas que tienen que seguir con la pantalla apagada (Android; no-op en desktop).
export { startBackgroundTask, endBackgroundTask } from "../services/background";

// ── Navegación: un quark pide al Shell enfocar su tab ──────────────────────────
// `requestOpenQuark` lo usa Utilidades para traer su pantalla al frente cuando
// suena una alarma. Ver `services/navigation.ts`.
export { requestOpenQuark } from "../services/navigation";

// ── Persistencia: escritura atómica en la raíz de AppData, soporta subcarpetas ─
// El quark guarda todo lo suyo bajo `packages/<id>/…` (índice + contenido).
// JSON por `name` sin extensión; texto plano por ruta completa. Ver StorageLayout.md.
export {
  readJson,
  writeJson,
  existsJson,
  deleteJson,
  readText,
  writeText,
  deleteFile,
  deleteDir,
} from "../services/store";

// ── Estado: base de los stores de quark + hook para suscribirse ───────────────
export { ExternalStore } from "../services/externalStore";
export { useStoreState } from "../frontend/hooks/useStoreState";

// ── Helpers puros compartidos ─────────────────────────────────────────────────
export { newId, messageOf, countWords, clamp, UNTITLED } from "../services/util";

// ── UI compartida: el quark la reusa, no la duplica (ver QuarkStructure.md) ────
export { Icon, type IconProps } from "../frontend/components/Icon";
export { Button, type ButtonProps, type ButtonVariant } from "../frontend/components/Button";
export { IconButton, type IconButtonProps } from "../frontend/components/IconButton";
export { TextInput, type TextInputProps } from "../frontend/components/TextInput";
export { Toggle, type ToggleProps } from "../frontend/components/Toggle";
export { QuarkToolbar, type QuarkToolbarProps } from "../frontend/components/QuarkToolbar";
export { ConfirmDialog, type ConfirmDialogProps } from "../frontend/components/ConfirmDialog";
export { ProgressBar, type ProgressBarProps } from "../frontend/components/ProgressBar";
export { useMenu, MenuPanel, MenuItem, MenuDivider, MenuHint } from "../frontend/components/Menu";

// ── Quarky (§6): contexto IA contribuido + handle al panel ─────────────────────
// Los quarks usan `useQuarky()` para abrir/cerrar el panel desde la toolbar o
// shortcuts propios; el contexto por turno lo aportan vía `Quark.buildAiContext`.
export { useQuarky } from "../quarky/hooks/useQuarky";
export type { QuarkyContextValue } from "../quarky/hooks/useQuarky";

// Bus de selección de texto: cualquier quark con editor puede publicar la
// selección actual del usuario para que Quarky la muestre y la inyecte al
// prompt como "El usuario se está refiriendo a este texto: …".
export { publishSelection, type ActiveSelection } from "../quarky/selection";
export { useActiveSelection } from "../quarky/hooks/useActiveSelection";

// Bus de propuestas IA del quark Libros: la tool `propose_chapter_rewrite`
// publica acá y el books quark consume para abrir la vista comparativa.
export {
  publishBookProposal,
  getBookProposal,
  subscribeBookProposal,
  type BookProposal,
} from "../quarky/proposals";
