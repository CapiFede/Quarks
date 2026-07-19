/**
 * Panel global de Quarky: overlay derecho, full-height, abre/cierra con F4.
 *
 * Estructura: header (título + selector de conversación + acciones) → lista de
 * mensajes scrolleable → input. Diseño deliberadamente minimal para M1; el
 * sidebar de conversaciones y la aprobación de tools llegan en M3/M4.
 *
 * Position fixed para evitar afectar el layout del Shell; el WindowFrame ya está
 * encima del titlebar nativo, así que la coordenada `top:0` se traduce a "abajo
 * de la titlebar" en la práctica visual del WebView.
 */
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { IconButton } from "../../components/IconButton";
import { ConversationList } from "./ConversationList";
import { ContextInspector } from "./ContextInspector";
import { InputToolbar } from "./InputToolbar";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TabBar } from "./TabBar";
import { ToolApprovalDialog } from "./ToolApprovalDialog";

const PANEL_WIDTH = 560;

export function Panel() {
  const quarky = useQuarky();

  if (!quarky.panelOpen) return null;

  return (
    <aside
      role="complementary"
      aria-label="Quarky"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: PANEL_WIDTH,
        height: "100%",
        zIndex: 90, // por debajo de Settings (100) y su card (101).
        display: "flex",
        flexDirection: "column",
        background: "var(--q-surface)",
        borderLeft: "1px solid var(--q-border-dark)",
        boxShadow: "-8px 0 24px rgba(0,0,0,.28)",
      }}
    >
      <Header />
      <TabBar />
      {/* `position: relative` para que el ToolApprovalDialog (position:absolute)
          se ancle adentro de esta área en lugar de adentro del aside (donde
          taparía el input). */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
        }}
      >
        {quarky.inspectorOpen ? <ContextInspector /> : <MessageList />}
        <ToolApprovalDialog />
      </div>
      <InputToolbar />
      <MessageInput />
    </aside>
  );
}

function Header() {
  const { close } = useQuarky();
  return (
    <header
      style={{
        flex: "0 0 44px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 8px 0 14px",
        borderBottom: "1px solid var(--q-border)",
      }}
    >
      <span
        style={{
          fontSize: "var(--q-fs-13)",
          fontWeight: "var(--q-fw-semibold)",
          color: "var(--q-text-primary)",
          flex: "0 0 auto",
        }}
      >
        Quarky
      </span>
      <div style={{ flex: 1 }} />
      {/* Historial: reabrir conversaciones cerradas (no abiertas como tab). */}
      <ConversationList />
      <IconButton
        name="close"
        tooltip="Cerrar (F4)"
        onClick={close}
      />
    </header>
  );
}
