/**
 * Menú de historial en el header del panel: lista todas las conversaciones
 * para reabrir las que no están abiertas como tab (seleccionar una la abre
 * como tab). Renombrar/borrar también viven acá. La navegación entre las tabs
 * abiertas va por la `TabBar`.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { Icon } from "../../components/Icon";
import { MenuHint, MenuPanel, useMenu } from "../../components/Menu";

export function ConversationList() {
  const { conversations, active, selectConversation, deleteConversation, renameConversation } =
    useQuarky();
  const { open, setOpen, ref } = useMenu<HTMLDivElement>();

  return (
    <div ref={ref} style={{ position: "relative", flex: "0 0 auto" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        title="Historial de conversaciones"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 28,
          padding: "0 8px",
          borderRadius: 6,
          background: open ? "var(--q-card-hover)" : "transparent",
          color: "var(--q-text-secondary)",
          fontSize: "var(--q-fs-12)",
          cursor: "default",
        }}
      >
        <Icon name="history" size={16} />
        <Icon name={open ? "expand_less" : "expand_more"} size={14} />
      </div>

      {open && (
        <MenuPanel align="right" minWidth={260}>
          {conversations.length === 0 && <MenuHint>No hay conversaciones todavía.</MenuHint>}
          {conversations.map((c) => (
            <Row
              key={c.id}
              title={c.title}
              isActive={c.id === active?.id}
              onSelect={() => {
                setOpen(false);
                void selectConversation(c.id);
              }}
              onRename={(title) => void renameConversation(c.id, title)}
              onDelete={() => void deleteConversation(c.id)}
            />
          ))}
        </MenuPanel>
      )}
    </div>
  );
}

function Row({
  title,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  title: string;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Al entrar en edición, foco + selección completa (es un rename, no append).
  // Depende solo de `editing`: si el título cambia mientras editás (el
  // auto-rename llega tras el primer turno), no pisamos lo que estás tipeando.
  useEffect(() => {
    if (!editing) return;
    setDraft(title);
    // setTimeout para dejar que el input se monte primero.
    const t = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== title) onRename(t);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(title);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 8px",
        borderRadius: 6,
        background: isActive
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: isActive ? "var(--q-primary-light)" : "var(--q-text-primary)",
        cursor: "default",
        fontSize: "var(--q-fs-12)",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid var(--q-primary-light)",
            borderRadius: 4,
            padding: "2px 6px",
            background: "var(--q-surface-alt)",
            color: "var(--q-text-primary)",
            fontFamily: "var(--q-font-sans)",
            fontSize: "var(--q-fs-12)",
            outline: "none",
          }}
        />
      ) : (
        <span
          onClick={onSelect}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
      )}
      {!editing && hover && (
        <>
          <RowIconButton
            icon="edit"
            tooltip="Renombrar"
            onClick={() => setEditing(true)}
          />
          <RowIconButton icon="delete" tooltip="Borrar" onClick={onDelete} />
        </>
      )}
    </div>
  );
}

function RowIconButton({
  icon,
  tooltip,
  onClick,
}: {
  icon: string;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={tooltip}
      style={{ display: "inline-flex", padding: 2, cursor: "default" }}
    >
      <Icon name={icon} size={14} color="var(--q-text-light)" />
    </span>
  );
}
