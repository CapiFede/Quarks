/**
 * IO del subsistema Quarky. Todo cuelga de `<AppData>/com.quarks.app/quarky/`:
 *
 *   quarky/
 *   ├── config.json
 *   ├── chats/<spaceId>/<conversationId>.json
 *   ├── memory/*.md          (M5)
 *   └── contexts/*.md        (M5: general.md + <quarkId>.md)
 *
 * Ver `.claude/knowledge/StorageLayout.md`. Usa el store atómico del core
 * (`services/store.ts`), así que escritura tmp+rename y serialización por archivo
 * vienen incluidas. La API key vive en el keyring (`services/secrets.ts`), NO acá.
 */
import { isTauri } from "@tauri-apps/api/core";
import { existsJson, readJson, writeJson } from "../services/store";
import { report } from "../services/log";
import {
  DEFAULT_CONFIG,
  type Conversation,
  type ConversationSummary,
  type QuarkyConfig,
} from "./types";

const CONFIG_KEY = "quarky/config";
const chatKey = (spaceId: string, id: string) => `quarky/chats/${spaceId}/${id}`;
const tabsKey = (spaceId: string) => `quarky/tabs/${spaceId}`;

/**
 * Estado de las tabs abiertas de un space: qué conversaciones están abiertas en
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

export async function readConversation(
  spaceId: string,
  id: string,
): Promise<Conversation | null> {
  // El fallback de readJson es para "shape parcial"; acá queremos detectar ausencia.
  if (!(await existsJson(chatKey(spaceId, id)))) return null;
  return readJson<Conversation | null>(chatKey(spaceId, id), null);
}

export async function writeConversation(conv: Conversation): Promise<void> {
  await writeJson(chatKey(conv.spaceId, conv.id), conv);
}

/**
 * Lista los resúmenes de las conversaciones del space, ordenadas por
 * `updatedAt` descendente. Carga la conversación completa para sacar el título y
 * la fecha (las conversaciones son chicas y son pocas; si más adelante crecen,
 * podemos sacar un índice).
 */
export async function listConversations(spaceId: string): Promise<ConversationSummary[]> {
  if (!isTauri()) return [];
  const dir = `quarky/chats/${spaceId}`;
  try {
    const { BaseDirectory, exists, readDir } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(dir, { baseDir: BaseDirectory.AppData }))) return [];
    const entries = await readDir(dir, { baseDir: BaseDirectory.AppData });
    const out: ConversationSummary[] = [];
    for (const e of entries) {
      if (!e.isFile || !e.name.endsWith(".json") || e.name.endsWith(".tmp")) continue;
      const id = e.name.slice(0, -".json".length);
      const conv = await readConversation(spaceId, id);
      if (conv) out.push({ id: conv.id, title: conv.title, updatedAt: conv.updatedAt });
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  } catch (e) {
    report("quarky.listConversations", e);
    return [];
  }
}

// ── Tabs abiertas (por space) ──────────────────────────────────────────────────

export async function readTabs(spaceId: string): Promise<TabsState> {
  return readJson<TabsState>(tabsKey(spaceId), EMPTY_TABS);
}

export async function writeTabs(spaceId: string, tabs: TabsState): Promise<void> {
  await writeJson(tabsKey(spaceId), tabs);
}

export async function deleteConversation(spaceId: string, id: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
    const path = `${chatKey(spaceId, id)}.json`;
    if (await exists(path, { baseDir: BaseDirectory.AppData })) {
      await remove(path, { baseDir: BaseDirectory.AppData });
    }
  } catch (e) {
    report("quarky.deleteConversation", e);
  }
}
