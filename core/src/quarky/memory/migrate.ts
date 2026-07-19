/**
 * Migración one-shot del esquema viejo (`quarky/memory/*.md`) al store JSON
 * único (`quarky/memory.json`).
 *
 * Estrategia:
 *   1. Si ya existe `memory.json` → no hacemos nada (migración idempotente).
 *   2. Si existen `.md` en `memory/` → convertir cada uno a `MemoryEntry`
 *      (category="fact", pinned=true para preservar el comportamiento previo de
 *      "todo se inyecta siempre"), guardar el JSON.
 *   3. Mover los `.md` originales a `memory.legacy/` (no borrar — paracaídas
 *      por si algo sale mal).
 *
 * Si todavía no hay nada (instalación fresca), también es no-op.
 *
 * Se invoca desde `bootstrap.ts` después de asegurar las carpetas. Tauri-only.
 */
import { isTauri } from "@tauri-apps/api/core";
import { existsJson } from "../../services/store";
import { report } from "../../services/log";
import { MEMORY_STORE_KEY, MEMORY_STORE_VERSION, type MemoryEntry, type MemoryStore } from "./types";
import { saveStore } from "./store";

const SRC_DIR = "quarky/memory";
const LEGACY_DIR = "quarky/memory.legacy";

/** Mismo formato de id que el resto del subsistema (16 hex). */
function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function migrateMemoryIfNeeded(): Promise<void> {
  if (!isTauri()) return;
  try {
    if (await existsJson(MEMORY_STORE_KEY)) return; // ya migrado o creado nuevo

    const { BaseDirectory, exists, readDir, readTextFile, rename, mkdir, stat } = await import(
      "@tauri-apps/plugin-fs"
    );
    if (!(await exists(SRC_DIR, { baseDir: BaseDirectory.AppData }))) return;

    const entries = await readDir(SRC_DIR, { baseDir: BaseDirectory.AppData });
    const mdFiles = entries.filter(
      (e) => e.isFile && e.name.endsWith(".md") && !e.name.endsWith(".tmp"),
    );

    // Sin .md previos → primer arranque o memoria vacía: igual creamos el
    // archivo para que el resto del código encuentre el shape esperado.
    if (mdFiles.length === 0) {
      await saveStore({ version: MEMORY_STORE_VERSION, entries: [] });
      return;
    }

    const migrated: MemoryEntry[] = [];
    for (const f of mdFiles) {
      const path = `${SRC_DIR}/${f.name}`;
      try {
        const content = (await readTextFile(path, { baseDir: BaseDirectory.AppData })).trim();
        if (!content) continue;
        const info = await stat(path, { baseDir: BaseDirectory.AppData });
        const mtime = info.mtime ? info.mtime.getTime() : Date.now();
        migrated.push({
          id: randomId(),
          text: content,
          category: "fact",
          // Preserva el comportamiento legacy: en M1 todo seguía inyectándose
          // sin distinción, así que las migradas arrancan pinned. El usuario
          // las puede despinear desde el inspector cuando llegue M2 (RAG).
          pinned: true,
          uses: 0,
          createdAt: mtime,
          updatedAt: mtime,
        });
      } catch (e) {
        report("memory.migrate.read:" + f.name, e);
      }
    }

    const store: MemoryStore = { version: MEMORY_STORE_VERSION, entries: migrated };
    await saveStore(store);

    // Una vez persistido el JSON, mover los .md a memory.legacy/. Si falla el
    // mv individual, no es crítico (el JSON ya es la nueva source of truth).
    if (!(await exists(LEGACY_DIR, { baseDir: BaseDirectory.AppData }))) {
      await mkdir(LEGACY_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    for (const f of mdFiles) {
      const from = `${SRC_DIR}/${f.name}`;
      const to = `${LEGACY_DIR}/${f.name}`;
      try {
        await rename(from, to, {
          oldPathBaseDir: BaseDirectory.AppData,
          newPathBaseDir: BaseDirectory.AppData,
        });
      } catch (e) {
        report("memory.migrate.move:" + f.name, e);
      }
    }
  } catch (e) {
    report("memory.migrate", e);
  }
}
