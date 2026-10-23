/**
 * Migración única desde la época de los Spaces (contextos Personal, Trabajo…
 * que particionaban la data de cada quark). Se sacaron: ahora cada quark tiene
 * una sola colección.
 *
 *   Antes:  settings.json { spaces: [...] }
 *           spaces/<spaceId>.json { <quarkId>: sección del quark }
 *           quarky/chats/<spaceId>/<id>.json · quarky/tabs/<spaceId>.json
 *   Ahora:  cada quark guarda su índice en `packages/<quarkId>/…`
 *           quarky/chats/<id>.json · quarky/tabs.json
 *
 * Corre en el arranque, antes de cargar settings y de montar cualquier quark.
 * Cada quark junta su parte vía `Quark.migrateSpaces`; Quarky mueve sus chats.
 * La marca de "ya migrado" es que `settings.json` no tenga `spaces`, y se saca
 * al final. Puede volver a correr: si algo falla a mitad, si se baja de Drive
 * un árbol de una versión vieja (el pull recarga la app), o si una versión
 * vieja que comparte la carpeta de datos vuelve a crear sus spaces. Por eso
 * cada paso FUSIONA con lo que ya está migrado (por id) en vez de pisarlo.
 *
 * Los archivos de `spaces/` no se borran: pasan a `spaces.legacy/`, fuera del
 * sync, como respaldo local (sin pisar uno anterior con el mismo nombre).
 */
import type { LegacySpace } from "../quark/types";
import { allQuarkInstances } from "../quark/registry";
import { migrateChatsFromSpaces } from "../quarky/store";
import { existsJson, listJson, moveJson, readJson, removeDirIfEmpty, writeJson } from "./store";
import { withScope } from "./log";

interface SpaceDef {
  id: string;
  name: string;
}

function isSpaceDef(s: unknown): s is SpaceDef {
  return (
    typeof s === "object" &&
    s !== null &&
    typeof (s as SpaceDef).id === "string" &&
    typeof (s as SpaceDef).name === "string"
  );
}

export async function migrateSpacesIfNeeded(): Promise<void> {
  const settings = await readJson<Record<string, unknown>>("settings", {});
  if (!Array.isArray(settings.spaces)) return;

  const defs = settings.spaces.filter(isSpaceDef);
  const { activeSpace } = await readJson<{ activeSpace?: unknown }>("appState", {});
  const activeId = defs.some((d) => d.id === activeSpace) ? activeSpace : defs[0]?.id;
  const spaces: LegacySpace[] = await Promise.all(
    defs.map(async (d) => ({
      id: d.id,
      name: d.name,
      active: d.id === activeId,
      sections: await readJson<Record<string, unknown>>(`spaces/${d.id}`, {}),
    })),
  );
  // El activo primero: en lo que no se puede sumar (p. ej. el último libro
  // abierto) gana el space en el que el usuario estaba parado.
  spaces.sort((a, b) => Number(b.active) - Number(a.active));

  for (const quark of allQuarkInstances()) {
    const migrate = quark.migrateSpaces?.bind(quark);
    if (migrate) await withScope(`${quark.id}.migrateSpaces`, () => migrate(spaces));
  }
  await withScope("quarky.migrateSpaces", () =>
    migrateChatsFromSpaces(spaces.map((s) => s.id)),
  );

  const { spaces: _spaces, ...rest } = settings;
  await writeJson("settings", rest);

  for (const name of await listJson("spaces")) {
    const target = (await existsJson(`spaces.legacy/${name}`))
      ? `spaces.legacy/${name}.${Date.now()}`
      : `spaces.legacy/${name}`;
    await moveJson(`spaces/${name}`, target);
  }
  await removeDirIfEmpty("spaces");
}
