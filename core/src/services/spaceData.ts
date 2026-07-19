/**
 * Datos por Space: un único archivo por space en `spaces/<spaceId>.json`, con una
 * sección por quark (la clave es el id del quark). Así un space contiene la info
 * de TODOS los quarks en un solo archivo (ver `.claude/knowledge/StorageLayout.md`).
 *
 *   spaces/personal.json → { "music": { playlists: [...] }, "notes": { ... } }
 *
 * El contenido pesado NO va acá: vive en `packages/<quark>/…` (p. ej. los audios y
 * el detalle de cada playlist). Acá va el índice/estado liviano del space.
 *
 * `writeSpaceSection` hace read-modify-write: para no pisar la sección de otro
 * quark, serializamos las escrituras por space con un lock async.
 */
import { readJson, writeJson } from "./store";

type SpaceFile = Record<string, unknown>;

const key = (spaceId: string) => `spaces/${spaceId}`;

// Cola de escrituras en curso por space: serializa el read-modify-write para que
// dos quarks que escriben su sección a la vez no se pisen (lost update).
const locks = new Map<string, Promise<unknown>>();

function withLock<T>(spaceId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(spaceId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  locks.set(spaceId, next);
  void next.finally(() => {
    if (locks.get(spaceId) === next) locks.delete(spaceId);
  });
  return next;
}

/** Lee la sección de un quark dentro del archivo del space (o `fallback`). */
export async function readSpaceSection<T>(
  spaceId: string,
  quarkId: string,
  fallback: T,
): Promise<T> {
  const file = await readJson<SpaceFile>(key(spaceId), {});
  const section = file[quarkId];
  return section === undefined ? fallback : { ...fallback, ...(section as Partial<T>) };
}

/** Escribe la sección de un quark, preservando las de los demás quarks del space. */
export function writeSpaceSection<T>(
  spaceId: string,
  quarkId: string,
  data: T,
): Promise<void> {
  return withLock(spaceId, async () => {
    const file = await readJson<SpaceFile>(key(spaceId), {});
    file[quarkId] = data;
    await writeJson(key(spaceId), file);
  });
}
