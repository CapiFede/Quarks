/**
 * Barrita encima del input del chat. Tres slots:
 *   - Izquierda: dropdown rápido del modelo (solo favoritos + "elegir otro").
 *   - Derecha: botón que abre el "Contexto actual" (overlay con system prompt,
 *     histórico, tools, memoria — cada sección colapsable).
 *
 * Es un strip aparte (no parte del input) para que cuando el textarea crezca
 * con texto multilinea, los controles no se muevan. Comparte la misma `border-top`
 * que el input para leerse como una unidad.
 */
import { useState } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { useActiveSelection } from "../../../quarky/hooks/useActiveSelection";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { countWords } from "../../../services/util";
import { MenuHint, MenuPanel, useMenu } from "../../components/Menu";

export function InputToolbar() {
  return (
    <div
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 10px",
        borderTop: "1px solid var(--q-border)",
        background: "var(--q-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
        <QuickModelPicker />
        <ContextToggle />
        <SelectionBadge />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
        <ModeSwitcher />
        <ContextButton />
      </div>
    </div>
  );
}

// ── Badge de "selección actual del usuario" ──────────────────────────────────

/**
 * Aviso al lado del chip del modelo cuando el usuario tiene texto seleccionado
 * en algún quark editable (books/notes). Sirve como confirmación visual de que
 * la IA va a recibir ese texto en el próximo turno.
 *
 * Si no hay selección, no renderea nada (no ocupa espacio).
 */
function SelectionBadge() {
  const sel = useActiveSelection();
  if (!sel) return null;
  const chars = sel.text.length;
  const words = countWords(sel.text);
  return (
    <span
      title={sel.label ? `${sel.label} — la IA lo va a recibir como contexto` : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 22,
        padding: "0 8px",
        borderRadius: 6,
        background: "var(--q-primary-soft)",
        color: "var(--q-primary-light)",
        fontSize: "var(--q-fs-11)",
        minWidth: 0,
        flex: "0 1 auto",
        overflow: "hidden",
      }}
    >
      <Icon name="text_select_start" size={12} fill={1} />
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {words} pal · {chars} car
      </span>
    </span>
  );
}

// ── Toggle del contexto del quark (p. ej. capítulo abierto) ───────────────────

/**
 * Chip que prende/apaga la inyección del contexto del quark activo (en Libros,
 * el capítulo abierto) en ESTA conversación. Solo aparece cuando hay algo para
 * adjuntar (el quark expone attachments) y hay conversación activa donde guardar
 * la preferencia.
 */
function ContextToggle() {
  const { active, getAiContext, setAttachContext } = useQuarky();
  if (!active) return null;
  const ctx = getAiContext();
  const attachments = ctx?.attachments ?? [];
  if (attachments.length === 0) return null;

  const on = active.attachContext !== false;
  // Etiqueta corta: el label del attachment viene como "CAPÍTULO_ABIERTO:Título".
  const firstLabel = attachments[0].label.split(":")[0].replace(/_/g, " ").toLowerCase();
  const label = attachments.length > 1 ? `${attachments.length} adjuntos` : firstLabel;

  return (
    <span
      onClick={() => void setAttachContext(!on)}
      title={
        on
          ? "El contexto del quark se está inyectando. Click para sacarlo de esta conversación."
          : "El contexto del quark está apagado en esta conversación. Click para inyectarlo."
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 22,
        padding: "0 8px",
        borderRadius: 6,
        background: on ? "var(--q-primary-soft)" : "transparent",
        border: on ? "none" : "1px solid var(--q-border)",
        color: on ? "var(--q-primary-light)" : "var(--q-text-light)",
        fontSize: "var(--q-fs-11)",
        cursor: "default",
        minWidth: 0,
        flex: "0 1 auto",
        overflow: "hidden",
      }}
    >
      <Icon name="attach_file" size={12} fill={on ? 1 : 0} />
      <span
        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {label}
      </span>
    </span>
  );
}

// ── Selector Ask / Agent ─────────────────────────────────────────────────────

function ModeSwitcher() {
  const { active, setMode, config } = useQuarky();
  // Si todavía no hay conversación activa, no podemos cambiar el mode (se
  // setea de `config.modeDefault` cuando arranque); mostramos el default como
  // disabled-info. Una vez que mandes el primer mensaje, el dropdown se activa.
  const current = active?.mode ?? config.modeDefault;

  return (
    <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--q-border)" }}>
      <ModeChip
        label="Ask"
        active={current === "ask"}
        disabled={!active}
        onClick={() => void setMode("ask")}
      />
      <ModeChip
        label="Agent"
        active={current === "agent"}
        disabled={!active}
        onClick={() => void setMode("agent")}
      />
    </div>
  );
}

function ModeChip({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <span
      onClick={disabled ? undefined : onClick}
      title={
        disabled
          ? "Mandá un mensaje primero para arrancar una conversación."
          : label === "Ask"
            ? "Modo Ask: solo tools de lectura."
            : "Modo Agent: tools de escritura piden aprobación."
      }
      style={{
        padding: "2px 8px",
        fontSize: "var(--q-fs-11)",
        fontWeight: active ? "var(--q-fw-semibold)" : "var(--q-fw-medium)",
        color: active
          ? "var(--q-primary-light)"
          : disabled
            ? "var(--q-text-light)"
            : "var(--q-text-secondary)",
        background: active ? "var(--q-primary-soft)" : "transparent",
        cursor: "default",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {label}
    </span>
  );
}

// ── Dropdown rápido de modelos favoritos ─────────────────────────────────────

function QuickModelPicker() {
  const { config, active, setModel, openSettings } = useQuarky();
  const { open, setOpen, ref } = useMenu<HTMLDivElement>();
  // Modelo efectivo: el de la conversación activa (por-chat) o el default global.
  const effectiveModel = active?.model ?? config.model;

  const favorites = config.favoriteModels;
  // Mostramos solo el id en el chip (compacto). El nombre humano se ve en Settings.
  const currentLabel = shortLabel(effectiveModel);

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 22,
          padding: "0 8px",
          borderRadius: 6,
          background: open ? "var(--q-card-hover)" : "transparent",
          color: "var(--q-text-secondary)",
          fontSize: "var(--q-fs-11)",
          cursor: "default",
          maxWidth: 240,
        }}
        title={effectiveModel}
      >
        <Icon name="auto_awesome" size={12} color="var(--q-text-light)" />
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {currentLabel}
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} size={12} />
      </div>

      {open && (
        <MenuPanel up minWidth={220} maxWidth={320}>
          {favorites.length === 0 ? (
            <MenuHint>No tenés favoritos. Marcalos con la estrella desde Settings.</MenuHint>
          ) : (
            favorites.map((id) => (
              <FavRow
                key={id}
                id={id}
                selected={id === effectiveModel}
                onClick={() => {
                  setOpen(false);
                  void setModel(id);
                }}
              />
            ))
          )}
          <div
            onClick={() => {
              setOpen(false);
              openSettings();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              marginTop: 4,
              borderTop: "1px solid var(--q-border)",
              borderRadius: 4,
              fontSize: "var(--q-fs-11)",
              color: "var(--q-text-secondary)",
              cursor: "default",
            }}
          >
            <Icon name="tune" size={12} />
            Gestionar modelos en Settings…
          </div>
        </MenuPanel>
      )}
    </div>
  );
}

function FavRow({
  id,
  selected,
  onClick,
}: {
  id: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        background: selected
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: selected ? "var(--q-primary-light)" : "var(--q-text-primary)",
        fontSize: "var(--q-fs-12)",
        cursor: "default",
      }}
    >
      <Icon name="star" size={12} fill={1} color="#E5C97B" />
      <span
        className="q-mono"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "var(--q-fs-11)",
        }}
      >
        {id}
      </span>
      {selected && <Icon name="check" size={12} />}
    </div>
  );
}

/**
 * Acorta el id de un modelo de OpenRouter (`provider/name`) para que entre en
 * el chip sin perder lo importante. Si no tiene `/`, lo devuelve tal cual.
 */
function shortLabel(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

// ── Botón "Contexto actual" ──────────────────────────────────────────────────

function ContextButton() {
  const { inspectorOpen, toggleInspector } = useQuarky();
  return (
    <IconButton
      name="data_object"
      tooltip={inspectorOpen ? "Cerrar contexto" : "Ver contexto enviado al modelo"}
      selected={inspectorOpen}
      onClick={toggleInspector}
      size={14}
    />
  );
}
