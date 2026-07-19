/**
 * Lectura/escritura de los contextos editables del system prompt.
 *
 * Layout en disco (todo dentro de `quarky/contexts/`):
 *   - `general.md`         Instrucciones base para CUALQUIER conversación.
 *   - `<quarkId>.md`       Instrucciones que se inyectan SOLO si ese quark está
 *                          activo (notes, books, music, etc.). Opcional por quark.
 *
 * Son archivos `.md` planos (no JSON) a propósito: el usuario debe poder abrirlos
 * en cualquier editor externo y editarlos sin que se rompa nada. La composición
 * del system prompt final vive en `systemPrompt.ts`.
 */
import { isTauri } from "@tauri-apps/api/core";
import { report } from "../services/log";

const DIR = "quarky/contexts";
const GENERAL_FILE = "general.md";
const quarkFile = (quarkId: string) => `${quarkId}.md`;

export const DEFAULT_GENERAL_PROMPT = `Sos Quarky, el asistente IA de Quarks, una suite de micro-apps minimalistas.
Hablás en español rioplatense por defecto. Sé conciso, directo y útil.
Si la pregunta es ambigua, ofrecé una respuesta razonable en lugar de pedir más detalles.
No inventes archivos, comandos ni APIs que no conocés.`;

// ── Helpers de IO directo (no van por el store JSON, son `.md` planos) ────────

async function readTextFile(relPath: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = `${DIR}/${relPath}`;
    if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return null;
    return await readTextFile(path, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    report("quarky.contexts.read:" + relPath, e);
    return null;
  }
}

async function writeTextFile(relPath: string, content: string): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  if (!(await exists(DIR, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const dest = `${DIR}/${relPath}`;
  const tmp = `${dest}.tmp`;
  await writeTextFile(tmp, content, { baseDir: BaseDirectory.AppData });
  await rename(tmp, dest, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

async function deleteFile(relPath: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
    const path = `${DIR}/${relPath}`;
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData });
    }
  } catch (e) {
    report("quarky.contexts.delete:" + relPath, e);
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

/** Lee el general prompt; si no hay archivo (o está fuera de Tauri), devuelve el default. */
export async function readGeneralPrompt(): Promise<string> {
  const raw = await readTextFile(GENERAL_FILE);
  if (raw === null) return DEFAULT_GENERAL_PROMPT;
  return raw;
}

export async function writeGeneralPrompt(content: string): Promise<void> {
  await writeTextFile(GENERAL_FILE, content);
}

/** Crea `general.md` con el default si no existe. Para el bootstrap. */
export async function ensureGeneralPromptFile(): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(`${DIR}/${GENERAL_FILE}`, { baseDir: BaseDirectory.AppData }))) {
    await writeTextFile(GENERAL_FILE, DEFAULT_GENERAL_PROMPT);
  }
}

/** Lee el prompt específico del quark; vacío si no hay (no es obligatorio). */
export async function readQuarkPrompt(quarkId: string): Promise<string> {
  return (await readTextFile(quarkFile(quarkId))) ?? "";
}

export async function writeQuarkPrompt(quarkId: string, content: string): Promise<void> {
  await writeTextFile(quarkFile(quarkId), content);
}

export async function deleteQuarkPrompt(quarkId: string): Promise<void> {
  await deleteFile(quarkFile(quarkId));
}
