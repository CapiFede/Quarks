/**
 * Store del notes quark. Sigue el mismo molde que `MusicStore` y `BooksStore`:
 * estado + acciones, compartido por toolbar y página vía `useSyncExternalStore`.
 * Vive en la instancia del quark y sobrevive a cambios de tab.
 *
 * Reparto por Space:
 *   - ÍNDICE de notas (id, título, preview, color, updatedAt) → sección `notes`
 *     de `spaces/<spaceId>.json` vía `readSpaceSection`/`writeSpaceSection`.
 *   - CUERPO de cada nota → `packages/notes/<noteId>.md`. El noteId NO contiene
 *     el spaceId: renombrar / mover el space no toca los .md.
 *
 * Autosave: 800ms de debounce sobre `activeContent`. Al cambiar de nota / space /
 * dispose se hace `flushSave()` para no perder el último tramo.
 */
import { readSpaceSection, writeSpaceSection } from "@quarks/core";
import type { NoteIndex, NoteMode, NotesState } from "./types";
import { deleteNote as deleteNoteFile, readNote, writeNote } from "./services/persistence";
import { buildPreview, formatJson, randomNoteColorId, sortByRecency } from "./util";

/** Id del quark: clave de su sección dentro del archivo del space. */
const QUARK_ID = "notes";

/** Estructura de la sección `notes` dentro de `spaces/<spaceId>.json`. */
interface SpaceFile {
  notes: NoteIndex[];
}

const AUTOSAVE_MS = 800;

const INITIAL: NotesState = {
  status: "idle",
  error: null,
  spaceId: null,
  notes: [],
  activeNoteId: null,
  activeContent: "",
  editorStatus: "saved",
  searchOpen: false,
  search: "",
};

// ── Helpers puros ─────────────────────────────────────────────────────────────

function isValidNoteIndex(v: unknown): v is NoteIndex {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as { id: unknown }).id === "string" &&
    typeof (v as { title: unknown }).title === "string"
  );
}

/** Normaliza un objeto que pasó `isValidNoteIndex` rellenando defaults faltantes. */
function normalizeNote(raw: NoteIndex): NoteIndex {
  return {
    id: raw.id,
    title: raw.title || "Sin título",
    preview: typeof raw.preview === "string" ? raw.preview : "",
    color: typeof raw.color === "string" ? raw.color : null,
    mode: raw.mode === "json" ? "json" : "text",
    wrap: raw.wrap === true,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}

function newId(): string {
  return crypto.randomUUID();
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : String(e);
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class NotesStore {
  private state: NotesState = INITIAL;
  private listeners = new Set<() => void>();

  // Estado fuera del snapshot.
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Para descartar resultados viejos cuando el space cambia rápido. */
  private spaceSeq = 0;
  /** Idem cuando se selecciona nota y se cambia antes de que termine la carga. */
  private noteSeq = 0;

  // ── useSyncExternalStore ──
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): NotesState => this.state;

  private set(patch: Partial<NotesState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    this.set({ status: "ready" });
  }

  dispose(): void {
    this.cancelAutosave();
    void this.flushSave();
  }

  // ── Space → índice ──
  async setSpace(spaceId: string): Promise<void> {
    if (this.state.spaceId === spaceId) return;
    await this.flushSave();
    const seq = ++this.spaceSeq;
    this.set({
      spaceId,
      status: "loading",
      notes: [],
      activeNoteId: null,
      activeContent: "",
      editorStatus: "saved",
      searchOpen: false,
      search: "",
    });
    try {
      const section = await readSpaceSection<SpaceFile>(spaceId, QUARK_ID, { notes: [] });
      if (seq !== this.spaceSeq) return;
      const notes = sortByRecency(
        (Array.isArray(section.notes) ? section.notes : [])
          .filter(isValidNoteIndex)
          .map(normalizeNote),
      );
      this.set({ notes, status: "ready" });
      // Auto-abrir la nota más reciente, si existe.
      if (notes.length > 0) await this.selectNote(notes[0].id);
    } catch (e) {
      if (seq !== this.spaceSeq) return;
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  private async persistIndex(): Promise<void> {
    const { spaceId, notes } = this.state;
    if (!spaceId) return;
    await writeSpaceSection<SpaceFile>(spaceId, QUARK_ID, { notes });
  }

  // ── Notas (CRUD) ──
  /** Crea una nota nueva (cuerpo vacío) y la deja abierta. Color al azar para
   *  que la sidebar sea visualmente variada de entrada — el usuario lo cambia
   *  desde el pill del editor si quiere. */
  async createNote(): Promise<string | null> {
    if (!this.state.spaceId) return null;
    await this.flushSave();
    const note: NoteIndex = {
      id: newId(),
      title: "Nueva nota",
      preview: "",
      color: randomNoteColorId(),
      mode: "text",
      wrap: false,
      updatedAt: Date.now(),
    };
    // Crear el .md vacío.
    await writeNote(note.id, "");
    this.set({
      notes: sortByRecency([note, ...this.state.notes]),
      activeNoteId: note.id,
      activeContent: "",
      editorStatus: "saved",
    });
    await this.persistIndex();
    return note.id;
  }

  async deleteNote(id: string): Promise<void> {
    const wasActive = this.state.activeNoteId === id;
    if (wasActive) await this.flushSave();
    const notes = this.state.notes.filter((n) => n.id !== id);
    const patch: Partial<NotesState> = { notes };
    if (wasActive) {
      patch.activeNoteId = null;
      patch.activeContent = "";
      patch.editorStatus = "saved";
    }
    this.set(patch);
    await this.persistIndex();
    await deleteNoteFile(id);
    if (wasActive && notes.length > 0) {
      // Abrir la más reciente que quede.
      await this.selectNote(notes[0].id);
    }
  }

  async renameNote(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) return;
    this.set({
      notes: sortByRecency(
        this.state.notes.map((n) =>
          n.id === id ? { ...n, title: trimmed, updatedAt: Date.now() } : n,
        ),
      ),
    });
    await this.persistIndex();
  }

  async setNoteColor(id: string, color: string | null): Promise<void> {
    this.set({
      notes: this.state.notes.map((n) => (n.id === id ? { ...n, color } : n)),
    });
    await this.persistIndex();
  }

  /**
   * Cambia el modo (text/json) de una nota. Si se activa json y el contenido
   * activo parsea OK, lo reemplaza por la versión formateada (indent 2). Si no
   * parsea, el toggle se aplica igual y el editor lo muestra sin tocar el texto.
   */
  async setNoteMode(id: string, mode: NoteMode): Promise<void> {
    this.set({
      notes: this.state.notes.map((n) => (n.id === id ? { ...n, mode } : n)),
    });
    if (mode === "json" && this.state.activeNoteId === id) {
      const pretty = formatJson(this.state.activeContent);
      if (pretty !== null && pretty !== this.state.activeContent) {
        this.updateContent(pretty);
      }
    }
    await this.persistIndex();
  }

  /** Toggle del modo wrap (envolver líneas) por nota. */
  async setNoteWrap(id: string, wrap: boolean): Promise<void> {
    this.set({
      notes: this.state.notes.map((n) => (n.id === id ? { ...n, wrap } : n)),
    });
    await this.persistIndex();
  }

  async selectNote(id: string): Promise<void> {
    if (this.state.activeNoteId === id) return;
    await this.flushSave();
    const seq = ++this.noteSeq;
    const exists = this.state.notes.find((n) => n.id === id);
    if (!exists) return;
    this.set({
      activeNoteId: id,
      activeContent: "",
      editorStatus: "saved",
    });
    const content = await readNote(id);
    if (seq !== this.noteSeq) return;
    this.set({ activeContent: content, editorStatus: "saved" });
  }

  // ── Editor ──
  updateContent(text: string): void {
    if (text === this.state.activeContent) return;
    this.set({ activeContent: text, editorStatus: "dirty" });
    this.scheduleAutosave();
  }

  private scheduleAutosave(): void {
    this.cancelAutosave();
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, AUTOSAVE_MS);
  }

  private cancelAutosave(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /** Forzar guardar lo pendiente AHORA (cambio de nota, dispose, etc.). */
  async flushSave(): Promise<void> {
    this.cancelAutosave();
    const { activeNoteId, activeContent, editorStatus, notes } = this.state;
    if (!activeNoteId || editorStatus === "saved") return;
    this.set({ editorStatus: "saving" });
    try {
      await writeNote(activeNoteId, activeContent);
      const now = Date.now();
      const preview = buildPreview(activeContent);
      this.set({
        notes: sortByRecency(
          notes.map((n) =>
            n.id === activeNoteId ? { ...n, preview, updatedAt: now } : n,
          ),
        ),
        editorStatus: "saved",
      });
      await this.persistIndex();
    } catch (e) {
      this.set({ editorStatus: "dirty", error: messageOf(e) });
    }
  }

  // ── Búsqueda ──
  toggleSearch(): void {
    const open = !this.state.searchOpen;
    this.set({ searchOpen: open, search: open ? this.state.search : "" });
  }

  setSearch(search: string): void {
    this.set({ search });
  }
}

/** Snapshot completo de estado para usuarios externos (sin métodos). */
export type { NotesState };
