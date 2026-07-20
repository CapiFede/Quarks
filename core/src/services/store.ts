/**
 * Almacenamiento de datos del core en disco.
 *
 * Cada archivo vive bajo `<AppData>/com.quarks.app/<name>.json` (resuelto por Tauri vía
 * `BaseDirectory.AppData`), directamente en la raíz de la app — sin el wrapper
 * `data/` que usaba antes. El `name` puede traer segmentos: globales en la raíz
 * (`settings`, `appState`, `account`), un archivo por space (`spaces/<id>`) y el
 * contenido de cada quark (`packages/<quark>/…`). Ver `.claude/knowledge/StorageLayout.md`.
 *
 * La escritura es **atómica**: se escribe a un `.tmp` y se renombra encima del
 * destino, así un corte a mitad de escritura nunca deja un JSON corrupto.
 *
 * Fuera de Tauri (p. ej. `pnpm core:dev` en el browser para iterar UI) cae a
 * `localStorage`, manteniendo la misma interfaz. Los secretos NO van por acá:
 * usan el keyring del SO (ver `secrets.ts`).
 */
import { isTauri } from "@tauri-apps/api/core";
import { report } from "./log";

const relPath = (name: string) => `${name}.json`;
const tmpPath = (name: string) => `${name}.json.tmp`;
const lsKey = (name: string) => `quarks.data.${name}`;
/** Carpeta padre de un `name` con segmentos, o "" si está en la raíz. */
const parentOf = (name: string) => {
  const slash = name.lastIndexOf("/");
  return slash === -1 ? "" : name.slice(0, slash);
};

/** Lee un JSON del store; devuelve `fallback` si no existe o está corrupto. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (!isTauri()) return readLocal(name, fallback);
  try {
    const { BaseDirectory, exists, readTextFile } = await import(
      "@tauri-apps/plugin-fs"
    );
    if (!(await exists(relPath(name), { baseDir: BaseDirectory.AppData }))) {
      return fallback;
    }
    const raw = await readTextFile(relPath(name), {
      baseDir: BaseDirectory.AppData,
    });
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch (e) {
    // Resiliencia: ante JSON corrupto/IO devolvemos fallback, pero avisamos.
    report("store.read:" + name, e);
    return fallback;
  }
}

/**
 * Cola de escrituras en curso por archivo. Serializa las escrituras de un mismo
 * `name` para que dos no compartan el mismo `.tmp` y una pise el rename de la
 * otra (race que StrictMode destapa al disparar el efecto de guardado dos veces).
 */
const writeQueues = new Map<string, Promise<void>>();

/** Escribe un JSON al store de forma atómica (tmp + rename), serializado por archivo. */
export function writeJson<T>(name: string, data: T): Promise<void> {
  const prev = writeQueues.get(name) ?? Promise.resolve();
  // `.catch` para que un fallo previo no encadene rechazos en las siguientes.
  const next = prev.catch(() => {}).then(() => writeJsonNow(name, data));
  writeQueues.set(name, next);
  void next.finally(() => {
    if (writeQueues.get(name) === next) writeQueues.delete(name);
  });
  return next;
}

async function writeJsonNow<T>(name: string, data: T): Promise<void> {
  if (!isTauri()) {
    writeLocal(name, data);
    return;
  }
  const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  // Carpeta padre del destino. `name` puede traer segmentos (p. ej.
  // "packages/music/playlists/<id>"), así que aseguramos toda la cadena de
  // carpetas. La raíz (parent === "") siempre existe: no hace falta crearla.
  const parent = parentOf(name);
  if (parent && !(await exists(parent, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await writeTextFile(tmpPath(name), JSON.stringify(data, null, 2), {
    baseDir: BaseDirectory.AppData,
  });
  await rename(tmpPath(name), relPath(name), {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

/** Renombra un JSON del store; si `oldName` no existe, no hace nada. */
export async function moveJson(oldName: string, newName: string): Promise<void> {
  if (!isTauri()) {
    const raw = localStorage.getItem(lsKey(oldName));
    if (raw !== null) {
      localStorage.setItem(lsKey(newName), raw);
      localStorage.removeItem(lsKey(oldName));
    }
    return;
  }
  const { BaseDirectory, exists, mkdir, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  if (!(await exists(relPath(oldName), { baseDir: BaseDirectory.AppData }))) return;
  const parent = parentOf(newName);
  if (parent && !(await exists(parent, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  await rename(relPath(oldName), relPath(newName), {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

/** Borra el JSON `name` del store si existe (no falla si no estaba). */
export async function deleteJson(name: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(lsKey(name));
    return;
  }
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(relPath(name), { baseDir: BaseDirectory.AppData })) {
    await remove(relPath(name), { baseDir: BaseDirectory.AppData });
  }
}

/** ¿Existe el JSON `name` en el store? */
export async function existsJson(name: string): Promise<boolean> {
  if (!isTauri()) return localStorage.getItem(lsKey(name)) !== null;
  const { BaseDirectory, exists } = await import("@tauri-apps/plugin-fs");
  return exists(relPath(name), { baseDir: BaseDirectory.AppData });
}

/** Crea la carpeta `relDir` (recursiva) si falta. Tauri-only; no-op en browser. */
export async function ensureDir(relDir: string): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, mkdir } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(relDir, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(relDir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}

// ── Acceso crudo al árbol gestionado (para el motor de sync) ──────────────────
//
// El sync espeja el conjunto GESTIONADO con la carpeta "Quarks" del Drive. A
// propósito NO se barre toda la raíz de AppData: ahí también vive la cache del
// WebView (p. ej. `EBWebView` en Windows) y los globales device-local
// (`appState`, `account`, `manifest`), que NO deben subir ni ser borrados por el
// sync force/mirror. Por eso usamos un allowlist explícito: el archivo
// `settings.json` + todo lo que cuelga de `spaces/` y `packages/`.
//
// Estas funciones operan por ruta relativa POSIX desde la raíz de AppData (p. ej.
// "settings.json", "spaces/personal.json" o "packages/music/songs/x.mp3"). Es
// Tauri-only; fuera de Tauri devuelve vacío / no-op, igual que `secrets.ts`.

/** Archivos globales sueltos en la raíz que SÍ sincronizan. */
const SYNC_FILES = ["settings.json"];
/** Carpetas cuyo contenido completo sincroniza. */
const SYNC_DIRS = ["spaces", "packages", "quarky"];

/** Rutas relativas de todos los archivos gestionados, recursivo (excluye `.tmp`). */
export async function listDataTree(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const { BaseDirectory, exists, readDir } = await import("@tauri-apps/plugin-fs");
    const out: string[] = [];
    for (const f of SYNC_FILES) {
      if (await exists(f, { baseDir: BaseDirectory.AppData })) out.push(f);
    }
    const walk = async (rel: string): Promise<void> => {
      for (const e of await readDir(rel, { baseDir: BaseDirectory.AppData })) {
        const childRel = `${rel}/${e.name}`;
        if (e.isDirectory) await walk(childRel);
        else if (e.isFile && !e.name.endsWith(".tmp")) out.push(childRel);
      }
    };
    for (const d of SYNC_DIRS) {
      if (await exists(d, { baseDir: BaseDirectory.AppData })) await walk(d);
    }
    return out;
  } catch (e) {
    report("store.listDataTree", e);
    return [];
  }
}

/**
 * Metadata de `<relPath>` (epoch ms de modificación + tamaño); `null` si no
 * existe. El motor de sync la usa como clave de cache para no re-hashear archivos
 * que no cambiaron (`stat` no lee el contenido, a diferencia de `readDataFile`).
 */
export async function statDataFile(
  relPath: string,
): Promise<{ mtime: number; size: number } | null> {
  if (!isTauri()) return null;
  try {
    const { BaseDirectory, exists, stat } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(relPath, { baseDir: BaseDirectory.AppData }))) return null;
    const info = await stat(relPath, { baseDir: BaseDirectory.AppData });
    return { mtime: info.mtime ? info.mtime.getTime() : 0, size: info.size };
  } catch (e) {
    report("store.statDataFile", e);
    return null;
  }
}

/** Lee los bytes crudos de `<relPath>`; `null` si no existe. */
export async function readDataFile(relPath: string): Promise<Uint8Array | null> {
  if (!isTauri()) return null;
  const { BaseDirectory, exists, readFile } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(relPath, { baseDir: BaseDirectory.AppData }))) return null;
  return readFile(relPath, { baseDir: BaseDirectory.AppData });
}

/** Escribe bytes en `<relPath>` de forma atómica (tmp + rename), creando carpetas. */
export async function writeDataFile(relPath: string, data: Uint8Array): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, mkdir, writeFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  // Carpeta padre (incluye subcarpetas anidadas del quark): crearla si falta.
  const parent = parentOf(relPath);
  if (parent && !(await exists(parent, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const tmp = `${relPath}.tmp`;
  await writeFile(tmp, data, { baseDir: BaseDirectory.AppData });
  await rename(tmp, relPath, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

/** Borra `<relPath>` si existe (no falla si no estaba). */
export async function deleteDataFile(relPath: string): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(relPath, { baseDir: BaseDirectory.AppData })) {
    await remove(relPath, { baseDir: BaseDirectory.AppData });
  }
}

// ── Fallback en browser (sin Tauri) ──────────────────────────────────────────

function readLocal<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(lsKey(name));
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch (e) {
    report("store.readLocal:" + name, e);
    return fallback;
  }
}

function writeLocal<T>(name: string, data: T): void {
  try {
    localStorage.setItem(lsKey(name), JSON.stringify(data));
  } catch (e) {
    // Cuota / modo privado: no es crítico, pero lo dejamos en consola.
    report("store.writeLocal:" + name, e);
  }
}
