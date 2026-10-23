import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, publishSelection, UNTITLED, useMenu } from "@quarks/core";
import type { Editor } from "@tiptap/react";
import type { NotesStore } from "../store";
import type { EditorStatus, NoteIndex } from "../types";
import { useNoteSelection } from "../hooks/useNoteSelection";
import { RichTextEditor } from "./RichTextEditor";
import { FormatBar } from "./FormatBar";
import {
  colorSwatch,
  formatJson,
  formatRelativeDate,
  formatTime,
  NOTE_COLORS,
  suggestTitle,
  tokenizeJson,
} from "../util";

export interface NoteEditorProps {
  store: NotesStore;
  note: NoteIndex;
  content: string;
  editorStatus: EditorStatus;
  /** Último error de guardado; el store lo limpia cuando un save sale bien. */
  error: string | null;
}

/**
 * Editor de la nota activa. Título arriba (input plano), pills (color / JSON /
 * wrap) + barra de formato, y el cuerpo: editor rich-text (TipTap, HTML como
 * fuente de verdad) en modo texto, o el editor JSON con highlight en modo json.
 */
export function NoteEditor({ store, note, content, editorStatus, error }: NoteEditorProps) {
  const [titleDraft, setTitleDraft] = useState(note.title);
  /** Instancia de TipTap de la nota abierta (la consume la barra de formato). */
  const [editor, setEditor] = useState<Editor | null>(null);
  // Sincronizar el input cuando cambia la nota activa (no en cada keystroke).
  useEffect(() => {
    setTitleDraft(note.title);
  }, [note.id, note.title]);

  // Selección de texto adentro del editor de notas → bus global de Quarky.
  // Mismo patrón que en quark-books: publicamos lo que hay, limpiamos al
  // desmontar (cambio de tab no debería dejar fantasma en el badge).
  const selection = useNoteSelection();
  useEffect(() => {
    if (!selection) {
      publishSelection(null);
      return;
    }
    publishSelection({
      source: "notes",
      text: selection.text,
      label: `Notas · ${note.title}`,
    });
  }, [selection, note.title]);
  useEffect(() => () => publishSelection(null), []);

  const commitTitle = () => {
    const v = titleDraft.trim();
    if (!v) {
      // Si quedó vacío, sugerir desde el contenido o restaurar el viejo.
      const suggestion = suggestTitle(content);
      if (suggestion) {
        setTitleDraft(suggestion);
        void store.renameNote(note.id, suggestion);
      } else {
        setTitleDraft(note.title);
      }
      return;
    }
    if (v !== note.title) void store.renameNote(note.id, v);
  };

  return (
    <div className="q-notes-editor">
      <div className="q-notes-editor-header">
        <input
          className="q-notes-title-input"
          value={titleDraft}
          placeholder={UNTITLED}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <div className="q-notes-editor-meta">
          <EditorStatusBadge status={editorStatus} error={error} />
          <span>{formatRelativeDate(note.updatedAt)} · {formatTime(note.updatedAt)}</span>
        </div>
      </div>

      <div className="q-notes-pills">
        <ColorPill store={store} note={note} />
        <JsonPill store={store} note={note} />
        {note.mode === "json" && <WrapPill store={store} note={note} />}
        {note.mode !== "json" && <FormatBar editor={editor} />}
      </div>

      <div className="q-notes-body">
        {note.mode === "json" ? (
          <JsonEditor store={store} content={content} wrap={note.wrap} />
        ) : (
          <RichTextEditor
            key={note.id}
            content={content}
            onUpdate={(html) => store.updateContent(html)}
            onEditorReady={setEditor}
          />
        )}
      </div>
    </div>
  );
}

// ── Pill de color ─────────────────────────────────────────────────────────────

interface ColorPillProps {
  store: NotesStore;
  note: NoteIndex;
}

function ColorPill({ store, note }: ColorPillProps) {
  const { open, setOpen, ref: wrapRef } = useMenu<HTMLSpanElement>();

  const currentLabel =
    NOTE_COLORS.find((c) => c.id === (note.color ?? "neutral"))?.label ?? "Neutro";

  return (
    <span ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span className="q-notes-pill" onClick={() => setOpen((o) => !o)}>
        <span
          className="q-notes-pill-swatch"
          style={{ background: colorSwatch(note.color) }}
        />
        {currentLabel}
        <Icon name="arrow_drop_down" size={12} color="var(--q-text-light)" />
      </span>
      {open && (
        <div
          className="q-notes-popover q-notes-color-popover"
          style={{ top: "calc(100% + 6px)", left: 0 }}
        >
          <div className="q-notes-color-grid">
            {NOTE_COLORS.map((c) => {
              const isActive = (note.color ?? "neutral") === c.id;
              const isNeutral = c.id === "neutral";
              return (
                <span
                  key={c.id}
                  className="q-notes-color-swatch-button"
                  data-active={isActive ? "true" : undefined}
                  data-neutral={isNeutral ? "true" : undefined}
                  title={c.label}
                  style={{ background: c.swatch }}
                  onClick={() => {
                    void store.setNoteColor(note.id, isNeutral ? null : c.id);
                    setOpen(false);
                  }}
                >
                  {isActive && (
                    <Icon
                      name="check"
                      size={14}
                      color={
                        isNeutral
                          ? "var(--q-text-primary)"
                          : "rgba(0, 0, 0, 0.78)"
                      }
                    />
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}

// ── Pill JSON (toggle) ────────────────────────────────────────────────────────

interface JsonPillProps {
  store: NotesStore;
  note: NoteIndex;
}

function JsonPill({ store, note }: JsonPillProps) {
  const active = note.mode === "json";
  return (
    <span
      className="q-notes-pill"
      data-active={active ? "true" : undefined}
      title={active ? "Modo JSON activo — clic para volver a texto" : "Activar modo JSON"}
      onClick={() => void store.setNoteMode(note.id, active ? "text" : "json")}
    >
      <Icon
        name="data_object"
        size={12}
        color={active ? "var(--q-primary-light)" : "var(--q-text-light)"}
      />
      JSON
    </span>
  );
}

// ── Pill Wrap (toggle, solo en modo JSON) ─────────────────────────────────────

interface WrapPillProps {
  store: NotesStore;
  note: NoteIndex;
}

function WrapPill({ store, note }: WrapPillProps) {
  const active = note.wrap;
  return (
    <span
      className="q-notes-pill"
      data-active={active ? "true" : undefined}
      title={active ? "Wrap activo — clic para desactivar" : "Envolver líneas largas"}
      onClick={() => void store.setNoteWrap(note.id, !active)}
    >
      <Icon
        name="wrap_text"
        size={12}
        color={active ? "var(--q-primary-light)" : "var(--q-text-light)"}
      />
      Wrap
    </span>
  );
}

// ── Editor JSON (overlay textarea + highlight) ────────────────────────────────

interface JsonEditorProps {
  store: NotesStore;
  content: string;
  wrap: boolean;
}

/**
 * Editor con syntax highlighting. Truco clásico de overlay:
 *   - Un `<pre>` debajo, con tokens coloreados.
 *   - Un `<textarea>` arriba, texto invisible, caret y selección visibles.
 * Ambos comparten font/padding/line-height para que la grilla calce 1:1.
 * Scroll sincronizado: solo el textarea recibe input, el pre se sincroniza.
 *
 * Al perder foco, si el contenido parsea como JSON válido, lo reemplazamos por
 * la versión formateada (indent 2) — así "auto-format" no rompe al usuario
 * mientras escribe, pero deja la nota limpia cuando se va.
 */
function JsonEditor({ store, content, wrap }: JsonEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Mantener el scroll del <pre> alineado con el textarea.
  const syncScroll = () => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  // Después de cualquier cambio de contenido, re-sincronizamos por las dudas
  // (el re-render podría haber reseteado scroll si el contenido se acortó).
  useLayoutEffect(syncScroll, [content]);

  const tokens = tokenizeJson(content);
  const wrapAttr = wrap ? "soft" : "off";

  return (
    <div className="q-notes-json" data-wrap={wrap ? "true" : "false"}>
      <pre ref={preRef} className="q-notes-json-pre" aria-hidden="true">
        {tokens.map((t, idx) => (
          <span key={idx} className={`q-json-${t.kind}`}>
            {t.text}
          </span>
        ))}
        {"\n"}
      </pre>
      <textarea
        ref={taRef}
        className="q-notes-json-textarea"
        value={content}
        onChange={(e) => store.updateContent(e.target.value)}
        onScroll={syncScroll}
        onBlur={() => {
          const pretty = formatJson(content);
          if (pretty !== null && pretty !== content) store.updateContent(pretty);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text/plain");
          if (text === undefined || text === null) return;
          e.preventDefault();
          const target = e.target as HTMLTextAreaElement;
          const start = target.selectionStart;
          const end = target.selectionEnd;
          const next = content.slice(0, start) + text + content.slice(end);
          // En modo JSON, si el contenido completo parsea OK lo formateamos al
          // toque (al usuario no tiene que importarle si vino feo del portapapeles).
          // Cursor al final del bloque pegado — si formateamos, va al final del todo
          // (recolocar logicamente dentro del JSON formateado es overkill).
          const pretty = formatJson(next);
          if (pretty !== null) {
            store.updateContent(pretty);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = pretty.length;
            });
          } else {
            store.updateContent(next);
            requestAnimationFrame(() => {
              target.selectionStart = target.selectionEnd = start + text.length;
            });
          }
        }}
        placeholder='{ "empezá": "a tipear JSON" }'
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap={wrapAttr}
      />
    </div>
  );
}

// ── Badge de estado del editor ────────────────────────────────────────────────

function EditorStatusBadge({ status, error }: { status: EditorStatus; error: string | null }) {
  const label =
    status === "saved" ? "guardada" : status === "saving" ? "guardando…" : "sin guardar";
  const color = status === "dirty" ? "var(--q-text-secondary)" : "var(--q-text-light)";
  return (
    <span className="q-notes-editor-status" style={{ color }}>
      {label}
      {error && (
        <span className="q-notes-editor-error" title={error}>
          {error}
        </span>
      )}
    </span>
  );
}
