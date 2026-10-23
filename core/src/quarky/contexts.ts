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
import { readText, writeText } from "../services/store";

const DIR = "quarky/contexts";
const GENERAL_FILE = `${DIR}/general.md`;
const quarkFile = (quarkId: string) => `${DIR}/${quarkId}.md`;

export const DEFAULT_GENERAL_PROMPT = `Sos Quarky, el asistente IA de Quarks, una suite de micro-apps minimalistas.
Hablás en español rioplatense por defecto. Sé conciso, directo y útil.
Si la pregunta es ambigua, ofrecé una respuesta razonable en lugar de pedir más detalles.
No inventes archivos, comandos ni APIs que no conocés.`;

/** Lee el general prompt; si no hay archivo, devuelve el default. */
export async function readGeneralPrompt(): Promise<string> {
  return (await readText(GENERAL_FILE)) ?? DEFAULT_GENERAL_PROMPT;
}

export async function writeGeneralPrompt(content: string): Promise<void> {
  await writeText(GENERAL_FILE, content);
}

/** Crea `general.md` con el default si no existe. Para el bootstrap. */
export async function ensureGeneralPromptFile(): Promise<void> {
  if ((await readText(GENERAL_FILE)) === null) {
    await writeText(GENERAL_FILE, DEFAULT_GENERAL_PROMPT);
  }
}

/** Lee el prompt específico del quark; vacío si no hay (no es obligatorio). */
export async function readQuarkPrompt(quarkId: string): Promise<string> {
  return (await readText(quarkFile(quarkId))) ?? "";
}

export async function writeQuarkPrompt(quarkId: string, content: string): Promise<void> {
  await writeText(quarkFile(quarkId), content);
}
