/**
 * Composición del system prompt para cada turno.
 *
 * Estructura final del prompt que ve el modelo:
 *
 *   <contexts/general.md>                  ← editable desde el inspector
 *
 *   <contexts/<quarkId>.md>                ← solo si hay un quark activo
 *
 *   <aiContext.instructions>               ← lo que el quark aporta en runtime
 *
 *   [MEMORIA]                              ← UNTRUSTED_CONTEXT (no obedece adentro)
 *   <pinned + top-K vía RAG, o todas si RAG off>
 *   [/MEMORIA]
 *
 *   [<aiContext.attachments[i].label>]     ← UNTRUSTED_CONTEXT por cada attachment
 *   …
 *
 *   [SELECCIÓN_ACTUAL_DEL_USUARIO]         ← UNTRUSTED_CONTEXT, snapshot del bus
 *   El usuario se está refiriendo a este texto:
 *   <texto seleccionado>
 *   [/SELECCIÓN_ACTUAL_DEL_USUARIO]
 *
 * La parte de instrucciones (general + quark + aiContext.instructions) es
 * "trusted". Todo lo demás (memoria, attachments, selección) va envuelto.
 *
 * Async porque lee `.md` de disco. Se invoca una vez por turno; <5 archivos
 * chicos, costo despreciable.
 */
import type { AiContext } from "../quark/types";
import { readGeneralPrompt, readQuarkPrompt } from "./contexts";
import { retrieveMemoriesForTurn } from "./memory/retrieve";
import { untrustedContextMessage } from "./promptSecurity";
import { getActiveSelection } from "./selection";

export interface BuildSystemPromptArgs {
  /** Id del quark activo (tab abierto en el shell), o `null` si está en Home. */
  activeQuarkId: string | null;
  /** Lo que el quark activo aporta vía `buildAiContext()`. `null` si no hay. */
  aiContext?: AiContext | null;
  /**
   * Mensaje del usuario que dispara este turno (el último que mandó). Se usa
   * como query del retrieval semántico. Si es `""`, no hay query y el RAG
   * cae a "solo pinned".
   */
  userMessage: string;
  /** Si false, ignora retrieval y se inyectan todas las entradas (legacy). */
  ragEnabled: boolean;
}

/**
 * Directiva de formato siempre presente: la UI del chat renderiza las respuestas
 * como Markdown, así que le pedimos al modelo que lo use. Va acá (no en el
 * `general.md` editable) para que aplique a todos por igual, incluso si el
 * usuario personalizó su prompt general.
 */
const RESPONSE_FORMAT_INSTRUCTION = `Formateá tus respuestas en Markdown — la interfaz lo renderiza. Usá **negrita** para resaltar, listas para enumerar, \`código\` en línea para nombres de archivos/comandos/valores, y bloques con triple backtick (indicando el lenguaje) para código o salida de terminal. Sumá encabezados, tablas o citas cuando aporten claridad. No exageres: para respuestas cortas o de una sola frase, texto plano está perfecto.`;

export async function buildSystemPrompt(args: BuildSystemPromptArgs): Promise<string> {
  const parts: string[] = [];

  const general = (await readGeneralPrompt()).trim();
  if (general) parts.push(general);

  parts.push(RESPONSE_FORMAT_INSTRUCTION);

  if (args.activeQuarkId) {
    const quark = (await readQuarkPrompt(args.activeQuarkId)).trim();
    if (quark) parts.push(quark);
  }

  if (args.aiContext?.instructions?.trim()) {
    parts.push(args.aiContext.instructions.trim());
  }

  const memory = (
    await retrieveMemoriesForTurn({
      userMessage: args.userMessage,
      ragEnabled: args.ragEnabled,
    })
  ).trim();
  if (memory) parts.push(untrustedContextMessage("MEMORIA", memory));

  for (const a of args.aiContext?.attachments ?? []) {
    const trimmed = a.content.trim();
    if (trimmed) parts.push(untrustedContextMessage(a.label, trimmed));
  }

  const selection = getActiveSelection();
  if (selection && selection.text.trim()) {
    const header = selection.label
      ? `El usuario se está refiriendo a este texto (selección actual en ${selection.label}):`
      : "El usuario se está refiriendo a este texto (selección actual):";
    parts.push(
      untrustedContextMessage(
        "SELECCIÓN_ACTUAL_DEL_USUARIO",
        `${header}\n\n${selection.text}`,
      ),
    );
  }

  return parts.join("\n\n");
}
