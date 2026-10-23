/**
 * Almacenamiento de datos del core en disco.
 *
 * Cada archivo vive bajo `<AppData>/com.quarks.app/<name>.json` (resuelto por Tauri vía
 * `BaseDirectory.AppData`), directamente en la raíz de la app — sin el wrapper
 * `data/` que usaba antes. El `name` puede traer segmentos: globales en la raíz
 * (`settings`, `appState`, `account`), Quarky (`quarky/…`) y el contenido de
 * cada quark (`packages/<quark>/…`). Ver `.claude/knowledge/StorageLayout.md`.
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
 * Cola de escrituras en curso por archivo. Serializa las escrituras de una misma
 * ruta para que dos no compartan el mismo `.tmp` y una pise el rename de la
 * otra (race que StrictMode destapa al disparar el efecto de guardado dos veces).
 */
const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(key: string, write: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  // `.catch` para que un fallo previo no encadene rechazos en las siguientes.
  const next = prev.catch(() => {}).then(write);
  writeQueues.set(key, next);
  // `then(cleanup, cleanup)` y no `finally`: la promesa derivada de un `finally`
  // hereda el rechazo y nadie la maneja → `unhandledrejection` aunque el caller
  // sí capture el error de `next`.
  const cleanup = () => {
    if (writeQueues.get(key) === next) writeQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}

/** Escribe un JSON al store de forma atómica (tmp + rename), serializado por archivo. */
export function writeJson<T>(name: string, data: T): Promise<void> {
  if (!isTauri()) {
    writeLocal(name, data);
    return Promise.resolve();
  }
  return enqueueWrite(relPath(name), () =>
    writeAtomic(relPath(name), JSON.stringify(data, null, 2)),
  );
}

/**
 * Escritura atómica de texto en `<relPath>` (tmp + rename), creando la cadena
 * de carpetas padre si falta. Tauri-only; es el único camino de escritura.
 */
async function writeAtomic(relPath: string, content: string): Promise<void> {
  const { BaseDirectory, exists, mkdir, writeTextFile, rename } = await import(
    "@tauri-apps/plugin-fs"
  );
  const parent = parentOf(relPath);
  if (parent && !(await exists(parent, { baseDir: BaseDirectory.AppData }))) {
    await mkdir(parent, { baseDir: BaseDirectory.AppData, recursive: true });
  }
  const tmp = `${relPath}.tmp`;
  await writeTextFile(tmp, content, { baseDir: BaseDirectory.AppData });
  await rename(tmp, relPath, {
    oldPathBaseDir: BaseDirectory.AppData,
    newPathBaseDir: BaseDirectory.AppData,
  });
}

// ── Texto plano (`.md` de notas, capítulos, prompts de Quarky) ───────────────
//
// Mismas garantías que el JSON (atómico + cola por archivo + fallback a
// localStorage en browser), pero el `relPath` lleva la extensión completa.

/** Lee el texto de `<relPath>`; `null` si no existe o falla la lectura. */
export async function readText(relPath: string): Promise<string | null> {
  if (!isTauri()) return localStorage.getItem(lsKey(relPath));
  try {
    const { BaseDirectory, exists, readTextFile } = await import("@tauri-apps/plugin-fs");
    if (!(await exists(relPath, { baseDir: BaseDirectory.AppData }))) return null;
    return await readTextFile(relPath, { baseDir: BaseDirectory.AppData });
  } catch (e) {
    report("store.readText:" + relPath, e);
    return null;
  }
}

/** Escribe texto en `<relPath>` de forma atómica, serializado por archivo. */
export function writeText(relPath: string, content: string): Promise<void> {
  if (!isTauri()) {
    try {
      localStorage.setItem(lsKey(relPath), content);
    } catch (e) {
      report("store.writeText:" + relPath, e);
    }
    return Promise.resolve();
  }
  return enqueueWrite(relPath, () => writeAtomic(relPath, content));
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

/**
 * Nombres (sin `.json`) de los JSON que están directamente en `relDir`, sin
 * entrar a subcarpetas; `[]` si la carpeta no existe. Tauri-only.
 */
export async function listJson(relDir: string): Promise<string[]> {
  if (!isTauri()) return [];
  const { BaseDirectory, exists, readDir } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(relDir, { baseDir: BaseDirectory.AppData }))) return [];
  const entries = await readDir(relDir, { baseDir: BaseDirectory.AppData });
  return entries
    .filter((e) => e.isFile && e.name.endsWith(".json"))
    .map((e) => e.name.slice(0, -".json".length));
}

/** Borra la carpeta `relDir` solo si existe y quedó vacía. Tauri-only. */
export async function removeDirIfEmpty(relDir: string): Promise<void> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, readDir, remove } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(relDir, { baseDir: BaseDirectory.AppData }))) return;
  if ((await readDir(relDir, { baseDir: BaseDirectory.AppData })).length > 0) return;
  await remove(relDir, { baseDir: BaseDirectory.AppData });
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
// `settings.json` + todo lo que cuelga de `packages/` y `quarky/`.
//
// Estas funciones operan por ruta relativa POSIX desde la raíz de AppData (p. ej.
// "settings.json", "quarky/tabs.json" o "packages/music/songs/x.mp3"). Es
// Tauri-only; fuera de Tauri devuelve vacío / no-op, igual que `secrets.ts`.

/** Archivos globales sueltos en la raíz que SÍ sincronizan. */
const SYNC_FILES = ["settings.json"];
/** Carpetas cuyo contenido completo sincroniza. */
const SYNC_DIRS = ["packages", "quarky"];

/**
 * Recorre `relDir` en profundidad y va entregando la ruta relativa (desde
 * AppData) de cada archivo, salteando los `.tmp` de escrituras a medias. Si la
 * carpeta no existe, no entrega nada. Tauri-only. Es un generator para que el
 * consumidor pueda cortar temprano (p. ej. tope de resultados de `glob`).
 */
export async function* walkFiles(relDir: string): AsyncGenerator<string> {
  if (!isTauri()) return;
  const { BaseDirectory, exists, readDir } = await import("@tauri-apps/plugin-fs");
  if (!(await exists(relDir, { baseDir: BaseDirectory.AppData }))) return;
  const stack = [relDir];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    for (const e of await readDir(dir, { baseDir: BaseDirectory.AppData })) {
      const childRel = `${dir}/${e.name}`;
      if (e.isDirectory) stack.push(childRel);
      else if (e.isFile && !e.name.endsWith(".tmp")) yield childRel;
    }
  }
}

/** Rutas relativas de todos los archivos gestionados, recursivo (excluye `.tmp`). */
export async function listDataTree(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const { BaseDirectory, exists } = await import("@tauri-apps/plugin-fs");
    const out: string[] = [];
    for (const f of SYNC_FILES) {
      if (await exists(f, { baseDir: BaseDirectory.AppData })) out.push(f);
    }
    for (const d of SYNC_DIRS) {
      for await (const rel of walkFiles(d)) out.push(rel);
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

/** Borra el archivo `<relPath>` si existe (no falla si no estaba). */
export async function deleteFile(relPath: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(lsKey(relPath));
    return;
  }
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(relPath, { baseDir: BaseDirectory.AppData })) {
    await remove(relPath, { baseDir: BaseDirectory.AppData });
  }
}

/** Borra la carpeta `<relDir>` entera, con lo que tenga adentro. */
export async function deleteDir(relDir: string): Promise<void> {
  if (!isTauri()) {
    const prefix = lsKey(`${relDir}/`);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) localStorage.removeItem(k);
    }
    return;
  }
  const { BaseDirectory, exists, remove } = await import("@tauri-apps/plugin-fs");
  if (await exists(relDir, { baseDir: BaseDirectory.AppData })) {
    await remove(relDir, { baseDir: BaseDirectory.AppData, recursive: true });
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
