import { Icon, type AiContext, type Quark } from "@quarks/core";
import { NotesStore } from "./store";
import { NotesPage } from "./sections/NotesPage";
import "./styles/notes.css";

/**
 * Implementación del contrato `Quark` para Notas.
 *
 * No aporta sub-toolbar: las únicas acciones (nueva nota, buscar) se accionan
 * desde el ítem "+ Nueva nota" en la sidebar y desde Ctrl/Cmd+F (Ctrl+F lo
 * captura `NotesPage` con un keydown global gateado por visibilidad de la pane).
 */
export function createNotesQuark(): Quark {
  const store = new NotesStore();

  return {
    id: "notes",
    name: "Notas",
    icon: <Icon name="edit_note" size={16} />,

    buildPage: () => <NotesPage store={store} />,

    onEscape: () => {
      if (store.getSnapshot().searchOpen) {
        store.toggleSearch();
        return true;
      }
      return false;
    },

    buildAiContext: () => buildNotesAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}

/**
 * Snapshot del state de Notas para Quarky.
 *   - `instructions`: listado de notas + cuál está abierta. Trusted.
 *   - `attachments`: el cuerpo de la nota abierta. Untrusted.
 */
function buildNotesAiContext(store: NotesStore): AiContext | null {
  const s = store.getSnapshot();
  if (s.notes.length === 0 && !s.activeNoteId) return null;

  const active = s.notes.find((n) => n.id === s.activeNoteId) ?? null;
  // Lista compacta para que la IA pueda referirse a notas que no están
  // abiertas ("abrí la nota sobre X"). Ordenada por recency (igual que el
  // sidebar) para que la primera sea la más reciente.
  const noteList = [...s.notes]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((n) => {
      const marker = n.id === s.activeNoteId ? " (abierta)" : "";
      return `- "${n.title}"${marker}`;
    })
    .join("\n");

  const headerLines = [
    "Estás en el quark Notas (editor de notas markdown / JSON).",
    active
      ? `Nota abierta: "${active.title}" (modo ${active.mode}).`
      : "El usuario no tiene ninguna nota abierta.",
  ];
  if (s.notes.length > 0) {
    headerLines.push("", "Notas en este space:", noteList);
  }

  const attachments = active
    ? [
        {
          label: `NOTA_ABIERTA:${active.title}`,
          content: s.activeContent,
        },
      ]
    : [];

  return {
    instructions: headerLines.join("\n"),
    attachments,
  };
}
