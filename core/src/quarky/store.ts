/**
 * IO del subsistema Quarky. Todo cuelga de `<AppData>/com.quarks.app/quarky/`:
 *
 *   quarky/
 *   ├── config.json
 *   ├── tabs.json            (conversaciones abiertas como tab)
 *   ├── chats/<conversationId>.json
 *   ├── memory.json          (ver memory/store.ts)
 *   └── contexts/*.md        (general.md + <quarkId>.md; ver contexts.ts)
 *
 * Ver `.claude/knowledge/StorageLayout.md`. Usa el store atómico del core
 * (`services/store.ts`), así que escritura tmp+rename y serialización por archivo
 * vienen incluidas. La API key vive en el keyring (`services/secrets.ts`), NO acá.
 */
import { isTauri } from "@tauri-apps/api/core";
import {
  deleteJson,
  existsJson,
  listJson,
  moveJson,
  readJson,
  removeDirIfEmpty,
  writeJson,
} from "../services/store";
import { report } from "../services/log";
import {
  DEFAULT_CONFIG,
  type Conversation,
  type ConversationSummary,
  type QuarkyConfig,
} from "./types";

const CONFIG_KEY = "quarky/config";
const CHATS_DIR = "quarky/chats";
const TABS_KEY = "quarky/tabs";
const chatKey = (id: string) => `${CHATS_DIR}/${id}`;

/**
 * Estado de las tabs abiertas: qué conversaciones están abiertas en
 * la barra y cuál es la activa. Persiste para que al reabrir la app el usuario
 * recupere sus tabs. Vive aparte de las conversaciones (que pueden existir sin
 * estar abiertas como tab, reabribles desde el historial).
 */
export interface TabsState {
  openIds: string[];
  activeId: string | null;
}

const EMPTY_TABS: TabsState = { openIds: [], activeId: null };

// ── Config ───────────────────────────────────────────────────────────────────

export async function readConfig(): Promise<QuarkyConfig> {
  return readJson<QuarkyConfig>(CONFIG_KEY, DEFAULT_CONFIG);
}

export async function writeConfig(config: QuarkyConfig): Promise<void> {
  await writeJson(CONFIG_KEY, config);
}

/** Crea `quarky/config.json` con los defaults si todavía no existe. Arranque. */
export async function ensureConfigFile(): Promise<void> {
  if (!(await existsJson(CONFIG_KEY))) await writeConfig(DEFAULT_CONFIG);
}

// ── Conversaciones ───────────────────────────────────────────────────────────

export async function readConversation(id: string): Promise<Conversation | null> {
  // El fallback de readJson es para "shape parcial"; acá queremos detectar ausencia.
  if (!(await existsJson(chatKey(id)))) return null;
  return readJson<Conversation | null>(chatKey(id), null);
}

export async function writeConversation(conv: Conversation): Promise<void> {
  await writeJson(chatKey(conv.id), conv);
}

/**
 * Lista los resúmenes de las conversaciones, ordenadas por `updatedAt`
 * descendente. Carga la conversación completa para sacar el título y la fecha
 * (las conversaciones son chicas y son pocas; si más adelante crecen, podemos
 * sacar un índice).
 */
export async function listConversations(): Promise<ConversationSummary[]> {
  if (!isTauri()) return [];
  try {
    const out: ConversationSummary[] = [];
    for (const id of await listJson(CHATS_DIR)) {
      const conv = await readConversation(id);
      if (conv) out.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  } catch (e) {
    report("quarky.listConversations", e);
    return [];
  }
}

// ── Tabs abiertas ──────────────────────────────────────────────────────────────

export async function readTabs(): Promise<TabsState> {
  return readJson<TabsState>(TABS_KEY, EMPTY_TABS);
}

export async function writeTabs(tabs: TabsState): Promise<void> {
  await writeJson(TABS_KEY, tabs);
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await deleteJson(chatKey(id));
  } catch (e) {
    report("quarky.deleteConversation", e);
  }
}

// ── Migración desde los Spaces ─────────────────────────────────────────────────

/**
 * Parte de Quarky de la migración única desde los Spaces (ver
 * `services/legacySpaces.ts`): cada conversación de `chats/<spaceId>/` sube a
 * `chats/`, y las tabs de cada space (`tabs/<spaceId>.json`) se suman a
 * `tabs.json`, detrás de las que ya hubiera y con las del primer space (el
 * activo) adelante. Idempotente: lo ya movido no se vuelve a tocar.
 */
export async function migrateChatsFromSpaces(spaceIds: string[]): Promise<void> {
  const tabs: TabsState[] = [];
  for (const spaceId of spaceIds) {
    const dir = `${CHATS_DIR}/${spaceId}`;
    for (const id of await listJson(dir)) {
      const src = `${dir}/${id}`;
      const dst = chatKey(id);
      if (await existsJson(dst)) {
        // Ya migrado en una corrida anterior: lo existente gana.
        await deleteJson(src);
        continue;
      }
      const conv = await readJson<Record<string, unknown> | null>(src, null);
      if (conv) {
        const { spaceId: _space, ...rest } = conv;
        await writeJson(dst, rest);
        await deleteJson(src);
      } else {
        // Ilegible: lo apartamos en vez de borrarlo, como `legacySpaces` con `spaces/`.
        await moveJson(src, `${CHATS_DIR}.legacy/${spaceId}/${id}`);
      }
    }
    await removeDirIfEmpty(dir);

    const key = `${TABS_KEY}/${spaceId}`;
    if (await existsJson(key)) {
      tabs.push(await readJson<TabsState>(key, EMPTY_TABS));
      await deleteJson(key);
    }
  }
  await removeDirIfEmpty(TABS_KEY);
  if (tabs.length === 0) return;

  if (await existsJson(TABS_KEY)) tabs.unshift(await readTabs());
  const openIds = [
    ...new Set(tabs.flatMap((t) => (Array.isArray(t.openIds) ? t.openIds : []))),
  ];
  const activeId = tabs.find((t) => t.activeId)?.activeId ?? openIds[0] ?? null;
  await writeTabs({ openIds, activeId });
}
