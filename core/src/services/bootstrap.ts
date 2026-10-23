/**
 * Creación de la estructura de archivos en el arranque (idempotente).
 *
 * El usuario debe encontrar la estructura completa apenas abre la app, aunque
 * esté vacía: los globales en la raíz, la carpeta `packages/` con una
 * subcarpeta por quark y sus subdirectorios propios, y la carpeta `quarky/` con
 * su layout (config + chats + contexts). Ver
 * `.claude/knowledge/StorageLayout.md`.
 *
 *   <AppData>/com.quarks.app/
 *   ├── settings.json · appState.json · account.json
 *   ├── packages/<quark>/<dir>/                (p. ej. music/songs, music/playlists)
 *   └── quarky/{config.json,tabs.json,chats/,memory.json,contexts/}
 */
import { ensureDir } from "./store";
import { ensureAppStateFile } from "./appState";
import { ensureAccountFile } from "./account/account";
import { ensureConfigFile as ensureQuarkyConfigFile } from "../quarky/store";
import { ensureGeneralPromptFile } from "../quarky/contexts";
import { QUARK_STUBS } from "../quark/registry";

/** Asegura toda la estructura en disco. No pisa archivos existentes. */
export async function ensureLayout(): Promise<void> {
  // Carpetas de quarks (vacías) y sus subdirectorios. `settings.json` ya lo crea
  // `loadSettings`.
  await ensureDir("packages");
  for (const stub of QUARK_STUBS) {
    await ensureDir(`packages/${stub.id}`);
    for (const d of stub.dirs ?? []) await ensureDir(`packages/${stub.id}/${d}`);
  }

  // Subsistema Quarky: carpetas + config con defaults.
  await ensureDir("quarky");
  await ensureDir("quarky/chats");
  await ensureDir("quarky/contexts");
  await ensureQuarkyConfigFile();
  await ensureGeneralPromptFile();

  // Globales device-local: que existan desde el primer arranque.
  await ensureAppStateFile();
  await ensureAccountFile();
}
