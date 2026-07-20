import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, IconButton } from "@quarks/core";
import { useEditorState, type Editor } from "@tiptap/react";
import { NOTE_COLORS } from "../util";

export interface FormatBarProps {
  /** Instancia de TipTap de la nota abierta (null mientras monta). */
  editor: Editor | null;
}

/**
 * Barra de formato del editor de notas: negrita / cursiva / color de texto /
 * H1-H3 / listas / tabla. Aplica sobre la selección con comandos de TipTap
 * (participan del undo nativo). El `onMouseDown` con `preventDefault` evita que
 * al clickear un botón el editor pierda el foco y la selección (mismo patrón
 * que la toolbar de books).
 */
export function FormatBar({ editor }: FormatBarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      inTable: e?.isActive("table") ?? false,
      color: (e?.getAttributes("textStyle").color as string | undefined) ?? null,
    }),
  });

  const chain = () => editor?.chain().focus();

  return (
    <span className="q-notes-format-bar" onMouseDown={(e) => e.preventDefault()}>
      <IconButton
        name="format_bold"
        tooltip="Negrita"
        size={15}
        selected={active?.bold}
        onClick={() => chain()?.toggleBold().run()}
      />
      <IconButton
        name="format_italic"
        tooltip="Cursiva"
        size={15}
        selected={active?.italic}
        onClick={() => chain()?.toggleItalic().run()}
      />
      <TextColorMenu editor={editor} current={active?.color ?? null} />
      <FormatDivider />
      <IconButton
        name="format_h1"
        tooltip="Título 1"
        size={15}
        selected={active?.h1}
        onClick={() => chain()?.toggleHeading({ level: 1 }).run()}
      />
      <IconButton
        name="format_h2"
        tooltip="Título 2"
        size={15}
        selected={active?.h2}
        onClick={() => chain()?.toggleHeading({ level: 2 }).run()}
      />
      <IconButton
        name="format_h3"
        tooltip="Título 3"
        size={15}
        selected={active?.h3}
        onClick={() => chain()?.toggleHeading({ level: 3 }).run()}
      />
      <FormatDivider />
      <IconButton
        name="format_list_bulleted"
        tooltip="Lista"
        size={15}
        selected={active?.bullet}
        onClick={() => chain()?.toggleBulletList().run()}
      />
      <IconButton
        name="format_list_numbered"
        tooltip="Lista numerada"
        size={15}
        selected={active?.ordered}
        onClick={() => chain()?.toggleOrderedList().run()}
      />
      <FormatDivider />
      <TableMenu editor={editor} inTable={active?.inTable ?? false} />
    </span>
  );
}

function FormatDivider() {
  return <span className="q-notes-format-divider" />;
}

/** Popover local con cierre por click afuera / Escape (patrón de ColorPill). */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, wrapRef };
}

/** Grilla de swatches de la paleta de notas (sin "neutral"). */
function ColorGrid({
  current,
  onPick,
}: {
  current: string | null;
  onPick: (hex: string) => void;
}) {
  const norm = (s: string) => s.toLowerCase();
  return (
    <div className="q-notes-color-grid">
      {NOTE_COLORS.filter((c) => c.id !== "neutral").map((c) => {
        const isActive = current !== null && norm(current) === norm(c.tint);
        return (
          <span
            key={c.id}
            className="q-notes-color-swatch-button"
            data-active={isActive ? "true" : undefined}
            title={c.label}
            style={{ background: c.swatch }}
            onClick={() => onPick(c.tint)}
          >
            {isActive && <Icon name="check" size={14} color="rgba(0, 0, 0, 0.78)" />}
          </span>
        );
      })}
    </div>
  );
}

// ── Color de texto ────────────────────────────────────────────────────────────

function TextColorMenu({ editor, current }: { editor: Editor | null; current: string | null }) {
  const { open, setOpen, wrapRef } = usePopover();
  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        name="format_color_text"
        tooltip="Color de texto"
        size={15}
        selected={open || current !== null}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          className="q-notes-popover q-notes-color-popover"
          style={{ top: "calc(100% + 6px)", left: 0 }}
        >
          <ColorGrid
            current={current}
            onPick={(hex) => {
              editor?.chain().focus().setColor(hex).run();
              setOpen(false);
            }}
          />
          <div
            className="q-notes-popover-item"
            style={{ marginTop: 6 }}
            onClick={() => {
              editor?.chain().focus().unsetColor().run();
              setOpen(false);
            }}
          >
            <Icon name="format_color_reset" size={14} />
            Quitar color
          </div>
        </div>
      )}
    </span>
  );
}

// ── Tabla ─────────────────────────────────────────────────────────────────────

function TableMenu({ editor, inTable }: { editor: Editor | null; inTable: boolean }) {
  const { open, setOpen, wrapRef } = usePopover();

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  const chain = () => editor?.chain().focus();

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        name="table"
        tooltip="Tabla"
        size={15}
        selected={open || inTable}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="q-notes-popover" style={{ top: "calc(100% + 6px)", left: 0 }}>
          {!inTable ? (
            <Item
              onClick={run(() =>
                chain()?.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
              )}
            >
              Insertar tabla
            </Item>
          ) : (
            <>
              <Item onClick={run(() => chain()?.addRowAfter().run())}>Agregar fila</Item>
              <Item onClick={run(() => chain()?.deleteRow().run())}>Quitar fila</Item>
              <Item onClick={run(() => chain()?.addColumnAfter().run())}>Agregar columna</Item>
              <Item onClick={run(() => chain()?.deleteColumn().run())}>Quitar columna</Item>
              <div className="q-notes-popover-divider" />
              <div className="q-notes-format-menu-label">Color de celda</div>
              <div style={{ padding: "2px 4px 4px" }}>
                <ColorGrid
                  current={null}
                  onPick={(hex) => {
                    editor?.chain().focus().setCellAttribute("backgroundColor", hex).run();
                    setOpen(false);
                  }}
                />
              </div>
              <Item
                onClick={run(() =>
                  chain()?.setCellAttribute("backgroundColor", null).run(),
                )}
              >
                Quitar color de celda
              </Item>
              <div className="q-notes-popover-divider" />
              <Item
                destructive
                onClick={run(() => chain()?.deleteTable().run())}
              >
                Borrar tabla
              </Item>
            </>
          )}
        </div>
      )}
    </span>
  );
}

function Item({
  children,
  destructive,
  onClick,
}: {
  children: ReactNode;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className="q-notes-popover-item"
      data-destructive={destructive ? "true" : undefined}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
