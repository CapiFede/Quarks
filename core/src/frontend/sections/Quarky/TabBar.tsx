/**
 * Barra de tabs de conversaciones. Cada tab es una conversación abierta; el
 * estado (qué tabs y cuál activa) persiste en disco, así que reabrir la app las
 * recupera. Acciones por tab: seleccionar (click), renombrar (doble-click o menú),
 * limpiar el chat sin cerrar la tab, y cerrar/borrar.
 *
 * El "+" al final abre una conversación nueva. El historial de conversaciones
 * cerradas (reabribles) vive en el dropdown del header (`ConversationList`).
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { Icon } from "../../components/Icon";
import { UNTITLED } from "../../../services/util";
import { MenuItem, MenuPanel, useMenu } from "../../components/Menu";

export function TabBar() {
  const { openTabIds, conversations, active, newConversation } = useQuarky();

  // Mapa id → título. `active` es la fuente más fresca (puede tener un rename que
  // todavía no se reflejó en la lista); caemos a la lista y por último a default.
  const titleOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of conversations) m.set(c.id, c.title);
    if (active) m.set(active.id, active.title);
    return m;
  }, [conversations, active]);

  if (openTabIds.length === 0) {
    // Sin tabs: solo el "+" para arrancar. Mantiene la barra presente y estable.
    return (
      <div style={barStyle}>
        <NewTabButton onClick={() => void newConversation()} />
      </div>
    );
  }

  return (
    <div style={barStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          minWidth: 0,
          flex: 1,
          overflowX: "auto",
        }}
      >
        {openTabIds.map((id) => (
          <Tab
            key={id}
            id={id}
            title={titleOf.get(id) ?? UNTITLED}
            isActive={id === active?.id}
          />
        ))}
      </div>
      <NewTabButton onClick={() => void newConversation()} />
    </div>
  );
}

const barStyle: React.CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 6px",
  borderBottom: "1px solid var(--q-border)",
  background: "var(--q-surface)",
};

function NewTabButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <span
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title="Nueva conversación"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        width: 24,
        height: 24,
        borderRadius: 6,
        background: hover ? "var(--q-card-hover)" : "transparent",
        color: "var(--q-text-secondary)",
        cursor: "default",
      }}
    >
      <Icon name="add" size={16} />
    </span>
  );
}

function Tab({ id, title, isActive }: { id: string; title: string; isActive: boolean }) {
  const { selectConversation, renameConversation, clearMessages, closeTab, deleteConversation } =
    useQuarky();
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const menu = useMenu<HTMLDivElement>();
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Solo al entrar en edición: si el título cambia mientras editás (auto-rename
  // tras el primer turno), no pisamos el draft.
  useEffect(() => {
    if (!editing) return;
    setDraft(title);
    const t = setTimeout(() => inputRef.current?.select(), 0);
    return () => clearTimeout(t);
  }, [editing]);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== title) renameConversation(id, t);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setEditing(false);
      setDraft(title);
    }
  };

  return (
    <div
      ref={menu.ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => !editing && void selectConversation(id)}
      onDoubleClick={() => setEditing(true)}
      title={title}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 4,
        flex: "0 0 auto",
        maxWidth: 160,
        height: 26,
        padding: "0 4px 0 10px",
        borderRadius: 6,
        background: isActive
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: isActive ? "var(--q-primary-light)" : "var(--q-text-secondary)",
        fontSize: "var(--q-fs-12)",
        cursor: "default",
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
            width: 120,
            border: "1px solid var(--q-primary-light)",
            borderRadius: 4,
            padding: "1px 5px",
            background: "var(--q-surface-alt)",
            color: "var(--q-text-primary)",
            fontFamily: "var(--q-font-sans)",
            fontSize: "var(--q-fs-12)",
            outline: "none",
          }}
        />
      ) : (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {title}
        </span>
      )}

      {!editing && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            menu.setOpen((v) => !v);
          }}
          title="Opciones"
          style={{
            display: "inline-flex",
            padding: 1,
            borderRadius: 4,
            opacity: hover || isActive || menu.open ? 1 : 0,
            cursor: "default",
          }}
        >
          <Icon name="more_vert" size={14} color="var(--q-text-light)" />
        </span>
      )}

      {!editing && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            void closeTab(id);
          }}
          title="Cerrar tab"
          style={{
            display: "inline-flex",
            padding: 1,
            borderRadius: 4,
            opacity: hover || isActive ? 1 : 0,
            cursor: "default",
          }}
        >
          <Icon name="close" size={14} color="var(--q-text-light)" />
        </span>
      )}

      {menu.open && (
        <MenuPanel minWidth={180}>
          <MenuItem icon="edit" label="Renombrar" onClick={menu.run(() => setEditing(true))} />
          <MenuItem
            icon="ink_eraser"
            label="Limpiar chat"
            onClick={menu.run(() => void clearMessages(id))}
          />
          <MenuItem
            icon="delete"
            label="Borrar conversación"
            danger
            onClick={menu.run(() => void deleteConversation(id))}
          />
        </MenuPanel>
      )}
    </div>
  );
}
