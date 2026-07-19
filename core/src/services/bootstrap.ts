/**
 * Creación de la estructura de archivos en el arranque (idempotente).
 *
 * El usuario debe encontrar la estructura completa apenas abre la app, aunque
 * esté vacía: los globales en la raíz, la carpeta `spaces/` con un archivo por
 * space (incluido el default), la carpeta `packages/` con una subcarpeta por
 * quark y sus subdirectorios propios, y la carpeta `quarky/` con su layout
 * (config + chats + memory + contexts). Ver `.claude/knowledge/StorageLayout.md`.
 *
 *   <AppData>/com.quarks.app/
 *   ├── settings.json · appState.json · account.json
 *   ├── spaces/<id>.json                       (uno por space)
 *   ├── packages/<quark>/<dir>/                (p. ej. music/songs, music/playlists)
 *   └── quarky/{config.json,chats/<space>/,memory.json,memory.legacy/,contexts/}
 */
import { ensureDir, existsJson, writeJson } from "./store";
import { ensureAppStateFile } from "./appState";
import { ensureAccountFile } from "./account/account";
import { ensureConfigFile as ensureQuarkyConfigFile } from "../quarky/store";
import { ensureGeneralPromptFile } from "../quarky/contexts";
import { migrateMemoryIfNeeded } from "../quarky/memory/migrate";
import type { Space } from "./spaces";
import { QUARK_STUBS } from "../quark/registry";

/**
 * Asegura toda la estructura en disco. `spaces` viene de los settings ya cargados
 * (siempre ≥1, incluye el default). No pisa archivos existentes.
 */
export async function ensureLayout(spaces: Space[]): Promise<void> {
  // Carpetas de quarks (vacías) y sus subdirectorios. `settings.json` ya lo crea
  // `loadSettings`; las carpetas `spaces/` se crean al escribir el primer archivo.
  await ensureDir("packages");
  for (const stub of QUARK_STUBS) {
    await ensureDir(`packages/${stub.id}`);
    for (const d of stub.dirs ?? []) await ensureDir(`packages/${stub.id}/${d}`);
  }

  // Un archivo por space (vacío: sin secciones de quark todavía). No clobber.
  for (const s of spaces) {
    if (!(await existsJson(`spaces/${s.id}`))) await writeJson(`spaces/${s.id}`, {});
  }

  // Subsistema Quarky: carpetas + config con defaults.
  await ensureDir("quarky");
  await ensureDir("quarky/chats");
  await ensureDir("quarky/memory");
  await ensureDir("quarky/contexts");
  for (const s of spaces) await ensureDir(`quarky/chats/${s.id}`);
  await ensureQuarkyConfigFile();
  await ensureGeneralPromptFile();
  // One-shot: migra `quarky/memory/*.md` viejos a `quarky/memory.json` si
  // todavía no existe el JSON. Idempotente.
  await migrateMemoryIfNeeded();

  // Globales device-local: que existan desde el primer arranque.
  await ensureAppStateFile();
  await ensureAccountFile();
}
