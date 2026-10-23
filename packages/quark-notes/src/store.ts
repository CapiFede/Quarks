/**
 * Store del notes quark. Sigue el mismo molde que `MusicStore` y `BooksStore`:
 * estado + acciones, compartido por toolbar y página vía `useSyncExternalStore`.
 * Vive en la instancia del quark y sobrevive a cambios de tab.
 *
 * Persistencia:
 *   - ÍNDICE de notas (id, título, preview, color, updatedAt) →
 *     `packages/notes/index.json`.
 *   - CUERPO de cada nota → `packages/notes/<noteId>.md`.
 *
 * Autosave: 800ms de debounce sobre `activeContent`. Al cambiar de nota o en
 * dispose se hace `flushSave()` para no perder el último tramo.
 */
import {
  readJson,
  writeJson,
  type LegacySpace,
  ExternalStore,
  newId,
  messageOf,
  UNTITLED,
} from "@quarks/core";
import type { NoteIndex, NoteMode, NotesState } from "./types";
import { deleteNote as deleteNoteFile, readNote, writeNote } from "./services/persistence";
import { buildPreview, formatJson, randomNoteColorId, sortByRecency } from "./util";

/** Id del quark: clave de su sección en los archivos de la época de los Spaces. */
const QUARK_ID = "notes";
/** Índice de notas. */
const INDEX_KEY = "packages/notes/index";

interface IndexFile {
  notes: NoteIndex[];
}

const AUTOSAVE_MS = 800;

const INITIAL: NotesState = {
  status: "idle",
  error: null,
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
    title: raw.title || UNTITLED,
    preview: typeof raw.preview === "string" ? raw.preview : "",
    color: typeof raw.color === "string" ? raw.color : null,
    mode: raw.mode === "json" ? "json" : "text",
    wrap: raw.wrap === true,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
  };
}

/** Notas válidas (y con defaults) de un `notes` leído de disco, sin validar. */
function parseNotes(raw: unknown): NoteIndex[] {
  return (Array.isArray(raw) ? raw : []).filter(isValidNoteIndex).map(normalizeNote);
}

/**
 * Migración única desde los Spaces: suma las notas de todos los spaces al
 * índice (ver `Quark.migrateSpaces`). Las que ya estaban, por id, no se tocan.
 */
export async function migrateNotesFromSpaces(spaces: LegacySpace[]): Promise<void> {
  const current = await readJson<IndexFile>(INDEX_KEY, { notes: [] });
  const byId = new Map(parseNotes(current.notes).map((n) => [n.id, n]));
  for (const s of spaces) {
    const section = s.sections[QUARK_ID] as Partial<IndexFile> | undefined;
    for (const n of parseNotes(section?.notes)) if (!byId.has(n.id)) byId.set(n.id, n);
  }
  await writeJson<IndexFile>(INDEX_KEY, { notes: sortByRecency([...byId.values()]) });
}

// ── Store ─────────────────────────────────────────────────────────────────────

export class NotesStore extends ExternalStore<NotesState> {
  constructor() {
    super(INITIAL);
  }

  // Estado fuera del snapshot.
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** El índice ya se leyó de disco. Antes de eso no se escribe (lo pisaría vacío). */
  private loaded = false;
  /** Para descartar resultados viejos cuando se selecciona nota y se cambia
   *  antes de que termine la carga. */
  private noteSeq = 0;

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    await this.flushSave();
    this.set({ status: "loading" });
    try {
      const file = await readJson<IndexFile>(INDEX_KEY, { notes: [] });
      const notes = sortByRecency(parseNotes(file.notes));
      this.loaded = true;
      this.set({ notes, status: "ready" });
      // Auto-abrir la nota más reciente, si existe.
      if (notes.length > 0) await this.selectNote(notes[0].id);
    } catch (e) {
      this.set({ status: "error", error: messageOf(e) });
    }
  }

  dispose(): void {
    this.cancelAutosave();
    void this.flushSave();
  }

  private async persistIndex(): Promise<void> {
    if (!this.loaded) return;
    await writeJson<IndexFile>(INDEX_KEY, { notes: this.state.notes });
  }

  // ── Notas (CRUD) ──
  /** Crea una nota nueva (cuerpo vacío) y la deja abierta. Color al azar para
   *  que la sidebar sea visualmente variada de entrada — el usuario lo cambia
   *  desde el pill del editor si quiere. */
  async createNote(): Promise<string | null> {
    if (!this.loaded) return null;
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
    // Leer ANTES de cambiar la nota activa y hacer un solo `set`: si primero
    // seteáramos `activeContent: ""`, el editor montaría vacío y lo tipeado
    // antes de que resuelva la lectura se pisaría con el segundo `set`.
    const content = await readNote(id);
    if (seq !== this.noteSeq) return;
    this.set({ activeNoteId: id, activeContent: content, editorStatus: "saved" });
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
    const { activeNoteId, activeContent, editorStatus } = this.state;
    if (!activeNoteId || editorStatus === "saved") return;
    this.set({ editorStatus: "saving" });
    try {
      await writeNote(activeNoteId, activeContent);
      // Derivar de `this.state.notes`, no de la copia previa al await: mientras
      // se escribía pudieron cambiar título/color de alguna nota y no queremos
      // pisarlos. Si la nota activa cambió, quien la cambió ya reseteó el editor.
      if (this.state.activeNoteId !== activeNoteId) return;
      const now = Date.now();
      const preview = buildPreview(activeContent);
      this.set({
        notes: sortByRecency(
          this.state.notes.map((n) =>
            n.id === activeNoteId ? { ...n, preview, updatedAt: now } : n,
          ),
        ),
        // Si se tipeó durante la escritura, lo grabado ya es viejo: queda
        // "dirty" para que el autosave pendiente lo vuelva a bajar.
        editorStatus: this.state.activeContent === activeContent ? "saved" : "dirty",
        error: null,
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
