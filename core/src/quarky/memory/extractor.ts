/**
 * Auto-extracción de memoria desde el diálogo.
 *
 * Después de cada respuesta del asistente, `extractAndStore()` mira los últimos
 * mensajes y decide si hay algo durable para guardar. Diseño (puerto del
 * `memory_extractor.py` de odysseus):
 *
 *   1. Regex fallback en español capta patrones obvios sin gastar tokens.
 *   2. LLM extractor (modelo barato/free de OpenRouter) procesa el mismo
 *      diálogo y devuelve JSON con máximo 2 hechos durables.
 *   3. Dedup triple barrera por candidato: similitud vectorial 0.72 → match
 *      exacto (lowercase) → Jaccard 0.6.
 *   4. Survivors → `addEntry()`. `identity` se autopinea adentro de store.
 *
 * Todo es best-effort: si el LLM falla, sobrevive el regex; si el embedder no
 * cargó, el dedup vectorial se saltea (queda exact + Jaccard).
 *
 * Se invoca background tras cada turno asistente (no bloquea al usuario).
 */
import { chatCompletion } from "../provider";
import { newConversation, makeUserMessage } from "../conversation";
import { report } from "../../services/log";
import {
  addEntry,
  listEntries,
} from "./store";
import { dotProduct, embed, getEmbedderStatus } from "./embeddings";
import { isMemoryCategory, type MemoryCategory, type MemoryEntry } from "./types";
import type { Message } from "../types";

const MAX_CONTEXT_MESSAGES = 6;
const MAX_REGEX_CANDIDATES = 2;
const VECTOR_DEDUP_THRESHOLD = 0.72;
const JACCARD_DEDUP_THRESHOLD = 0.6;

/**
 * Modelo de respaldo (pago, confiable) para la extracción cuando el `:free`
 * configurado falla — típicamente rate-limit o baja del modelo. Solo se usa si
 * el primario tira error y es distinto a este.
 */
const FALLBACK_EXTRACTOR_MODEL = "deepseek/deepseek-v4-flash";

const EXTRACTOR_SYSTEM_PROMPT = `Sos un extractor de memoria de un asistente personal. Identificás hechos DURABLES sobre el usuario en un diálogo y los devolvés como JSON.

Hecho DURABLE = información que va a seguir siendo cierta en futuras conversaciones (nombre, ubicación, gustos, proyectos en curso, preferencias, posesiones, relaciones).

NO son durables:
- Estados emocionales pasajeros ("estoy contento", "tengo hambre")
- Eventos puntuales sin proyección ("hoy fui al super")
- Lo que dice el asistente (solo hechos sobre el USUARIO)
- Información obvia o trivial ("el usuario habla español")

Categorías permitidas:
- "identity": datos personales fijos (nombre, edad, ubicación, idioma)
- "preference": gustos, opiniones, modos de trabajo
- "project": iniciativas o trabajos en curso
- "task": pendientes con deadline o expectativa de seguimiento
- "fact": el resto (pertenencias, contexto, relaciones)

REGLAS ESTRICTAS:
- Máximo 2 hechos por turno.
- "text" en tercera persona ("El usuario se llama Federico", "Le gusta el café sin azúcar").
- Concreto y autocontenido (entendible sin ver el diálogo).
- En el idioma del diálogo.
- Si no hay nada durable, devolvé [].

Devolvé SOLO el JSON, sin markdown ni explicaciones. Forma:
[{"text": "...", "category": "..."}]`;

export interface ExtractAndStoreArgs {
  messages: Message[];
  extractorModel: string;
}

interface Candidate {
  text: string;
  category: MemoryCategory;
}

export async function extractAndStore(args: ExtractAndStoreArgs): Promise<{
  candidates: Candidate[];
  saved: MemoryEntry[];
}> {
  const dialogue = filterDialogue(args.messages).slice(-MAX_CONTEXT_MESSAGES);
  if (dialogue.length === 0) return { candidates: [], saved: [] };

  // 1) Regex fallback — siempre primero, sirve incluso si el LLM falla.
  const regexHits = regexCandidates(dialogue).slice(0, MAX_REGEX_CANDIDATES);

  // 2) LLM extractor. Si el modelo primario (típicamente un :free) falla,
  //    reintentamos una vez con el modelo de respaldo. Si ambos fallan, igual
  //    procesamos los regex.
  let llmHits: Candidate[] = [];
  try {
    llmHits = await llmExtract(dialogue, args.extractorModel);
  } catch (e) {
    report("quarky.extractor.llm", e);
    if (args.extractorModel !== FALLBACK_EXTRACTOR_MODEL) {
      try {
        llmHits = await llmExtract(dialogue, FALLBACK_EXTRACTOR_MODEL);
      } catch (e2) {
        report("quarky.extractor.llmFallback", e2);
      }
    }
  }

  // 3) Dedup contra entradas existentes + entre sí.
  const existing = await listEntries();
  const survivors: Candidate[] = [];
  // Dedup interno: primero entre las candidatas, después contra `existing`.
  for (const c of [...regexHits, ...llmHits]) {
    if (await isDuplicate(c, [...existing, ...toEntryShape(survivors)])) continue;
    survivors.push(c);
  }

  const saved: MemoryEntry[] = [];
  for (const c of survivors) {
    try {
      const entry = await addEntry({ text: c.text, category: c.category });
      saved.push(entry);
    } catch (e) {
      report("quarky.extractor.save", e);
    }
  }
  return { candidates: survivors, saved };
}

// ── Pre-procesado del diálogo ────────────────────────────────────────────────

interface DialogueLine {
  role: "user" | "assistant";
  content: string;
}

function filterDialogue(messages: Message[]): DialogueLine[] {
  const out: DialogueLine[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = (m.content ?? "").trim();
    if (!text) continue; // assistant-only-toolCalls y similares
    out.push({ role: m.role, content: text });
  }
  return out;
}

function formatDialogueForLlm(lines: DialogueLine[]): string {
  return lines
    .map((l) => `${l.role === "user" ? "Usuario" : "Asistente"}: ${l.content}`)
    .join("\n");
}

// ── Regex fallback (es-AR) ───────────────────────────────────────────────────

const REGEX_RULES: { re: RegExp; category: MemoryCategory; render: (m: RegExpMatchArray) => string }[] = [
  {
    re: /\b(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)\b/i,
    category: "identity",
    render: (m) => `El usuario se llama ${capitalize(m[1])}.`,
  },
  {
    re: /\bvivo en\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/i,
    category: "identity",
    render: (m) => `El usuario vive en ${capitalize(m[1])}.`,
  },
  {
    re: /\bsoy de\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/i,
    category: "identity",
    render: (m) => `El usuario es de ${capitalize(m[1])}.`,
  },
  {
    re: /\btengo\s+(\d{1,3})\s+años?\b/i,
    category: "identity",
    render: (m) => `El usuario tiene ${m[1]} años.`,
  },
  {
    re: /\b(?:me gusta(?:n)?|prefiero|amo)\s+([^.!?\n,]{3,60})/i,
    category: "preference",
    render: (m) => `Al usuario le gusta ${m[1].trim()}.`,
  },
  {
    re: /\b(?:estoy trabajando en|trabajo en)\s+([^.!?\n,]{3,60})/i,
    category: "project",
    render: (m) => `El usuario está trabajando en ${m[1].trim()}.`,
  },
];

function regexCandidates(lines: DialogueLine[]): Candidate[] {
  // Solo miramos lo que dijo el USUARIO; el asistente no debe inyectarse memoria.
  const userText = lines
    .filter((l) => l.role === "user")
    .map((l) => l.content)
    .join("\n");
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const rule of REGEX_RULES) {
    const m = userText.match(rule.re);
    if (!m) continue;
    const text = rule.render(m).trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push({ text, category: rule.category });
    if (out.length >= MAX_REGEX_CANDIDATES) break;
  }
  return out;
}

function capitalize(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// ── LLM extractor ────────────────────────────────────────────────────────────

async function llmExtract(lines: DialogueLine[], model: string): Promise<Candidate[]> {
  // Usamos `chatCompletion` con una "conversación efímera" que no se persiste:
  // un mensaje user con el diálogo formateado + el system prompt restrictivo.
  // Es el mismo wire format que el resto de Quarky, así se reusa el provider.
  const ephemeral = newConversation("__extractor__", "ask");
  ephemeral.messages = [makeUserMessage(formatDialogueForLlm(lines))];
  const result = await chatCompletion({
    systemPrompt: EXTRACTOR_SYSTEM_PROMPT,
    conversation: ephemeral,
    model,
  });
  return parseLlmOutput(result.content);
}

/**
 * Parser tolerante: intenta `JSON.parse` directo, después busca arrays adentro
 * de fences de markdown, después intenta cortar el primer `[…]` que encuentre.
 */
function parseLlmOutput(raw: string): Candidate[] {
  const tries: string[] = [raw.trim()];
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) tries.push(fenceMatch[1].trim());
  const arrayMatch = raw.match(/\[\s*[\s\S]*?\]/);
  if (arrayMatch) tries.push(arrayMatch[0]);
  for (const t of tries) {
    try {
      const parsed = JSON.parse(t);
      if (!Array.isArray(parsed)) continue;
      const out: Candidate[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object") continue;
        const text = typeof item.text === "string" ? item.text.trim() : "";
        const category = isMemoryCategory(item.category) ? item.category : "fact";
        if (!text) continue;
        out.push({ text, category });
        if (out.length >= 2) break; // hard cap, por si el modelo ignora la regla
      }
      return out;
    } catch {
      // probamos el siguiente
    }
  }
  return [];
}

// ── Dedup triple barrera ─────────────────────────────────────────────────────

async function isDuplicate(c: Candidate, against: MemoryEntry[]): Promise<boolean> {
  const candText = c.text.toLowerCase().trim();

  // (a) Exact match (lowercase). Cheap, no async.
  for (const e of against) {
    if (e.text.toLowerCase().trim() === candText) return true;
  }

  // (b) Jaccard de tokens. También sin async.
  const candTokens = tokenSet(candText);
  for (const e of against) {
    if (jaccard(candTokens, tokenSet(e.text.toLowerCase())) >= JACCARD_DEDUP_THRESHOLD) {
      return true;
    }
  }

  // (c) Vectorial. Solo si el embedder está vivo y hay alguna entry con vector.
  const { status } = getEmbedderStatus();
  if (status === "error") return false;
  const withEmbedding = against.filter(
    (e) => Array.isArray(e.embedding) && e.embedding.length > 0,
  );
  if (withEmbedding.length === 0) return false;

  let candVec: Float32Array;
  try {
    candVec = await embed(c.text, "passage");
  } catch (e) {
    report("quarky.extractor.embed", e);
    return false;
  }
  for (const e of withEmbedding) {
    if (dotProduct(candVec, e.embedding ?? []) >= VECTOR_DEDUP_THRESHOLD) return true;
  }
  return false;
}

function tokenSet(s: string): Set<string> {
  const out = new Set<string>();
  for (const tok of s.split(/[^a-záéíóúñ0-9]+/i)) {
    if (tok.length >= 3) out.add(tok);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Para dedup intra-batch sin tener que crear MemoryEntries falsas. */
function toEntryShape(cands: Candidate[]): MemoryEntry[] {
  const now = Date.now();
  return cands.map((c, i) => ({
    id: `__cand_${i}`,
    text: c.text,
    category: c.category,
    pinned: false,
    uses: 0,
    createdAt: now,
    updatedAt: now,
  }));
}
