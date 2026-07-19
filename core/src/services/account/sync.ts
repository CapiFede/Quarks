/**
 * Motor de sync: espeja el árbol GESTIONADO del core con la carpeta "Quarks" del
 * Drive del usuario. El conjunto gestionado lo define `listDataTree` (store.ts):
 * `settings.json` + todo `spaces/` + todo `packages/`. Queda fuera lo device-local
 * (`appState`, `account`, `manifest`) y la cache del WebView. La estructura local
 * se replica igual en Drive (subcarpetas incluidas) y viceversa.
 *
 * Semántica **force** (estilo `git push -f` / `reset --hard`), no merge:
 *
 *   SUBIR (push):  la nube queda IDÉNTICA a tu PC. Sube las altas/cambios locales
 *                  y manda a la papelera lo que en la nube no esté en tu PC.
 *   BAJAR (pull):  tu PC queda IDÉNTICA a la nube. Baja las altas/cambios de la
 *                  nube y borra de tu PC lo que en la nube no esté.
 *
 * El diff es 2-vías (local vs nube), con el local como "working tree" y la nube
 * como baseline (igual que `git status`): `added` = solo local (+ verde),
 * `removed` = solo nube (− rojo), `modified` = distinto (● amarillo). La UI lo
 * muestra archivo por archivo; los botones aplican ese diff en una dirección.
 *
 * Dos manifiestos, ambos por SHA-256 de contenido:
 *   · CACHE LOCAL (`sync.json`, device-local): `ruta → { sha, mtime, size }`. Es
 *     un cache de hashes: solo se re-hashea un archivo si cambió su `mtime`/`size`
 *     (evita re-hashear cientos de mp3 en cada chequeo).
 *   · MANIFIESTO EN LA NUBE (`manifest.json` dentro de "Quarks"): `ruta → { sha,
 *     id }`. Describe el árbol remoto sin caminarlo: el chequeo baja un solo JSON.
 *     Si falta (primera vez / lo borraron) se asume nube vacía (NO se camina el
 *     árbol, que sería lentísimo); la primera Subir lo crea.
 *
 * Progreso y cancelación: push/pull/check aceptan `{ signal, onProgress }`. El
 * `signal` (AbortSignal) corta el loop entre archivos y aborta la request en
 * vuelo. La cancelación es **reanudable**: al cortar se persiste lo realmente
 * transferido —en push, el manifiesto de la nube con los archivos ya subidos/
 * borrados (y sus `id`, para no duplicar en el reintento); en pull, el árbol local
 * ya bajado— más el cache de hashes para no re-hashear. El reintento recalcula el
 * diff y solo procesa lo que falta.
 */
import {
  deleteDataFile,
  listDataTree,
  readDataFile,
  readJson,
  statDataFile,
  writeDataFile,
  writeJson,
} from "../store";
import { getAccessToken, loadAccount, refreshAccessToken } from "./account";
import { getSyncProvider } from "./registry";
import type { SyncProvider } from "./types";

/** Carpeta tope en el Drive del usuario que espeja el árbol gestionado del core. */
const FOLDER_NAME = "Quarks";

/** Nombre del manifiesto, igual en ambos lados: `manifest.json` (raíz local,
 *  device-local) y "Quarks/manifest.json" (nube). Describe el árbol por SHA. */
const MANIFEST_NAME = "manifest.json";

/**
 * Archivos que nunca se sincronizan: device-local (`appState`, `account`) y el
 * propio manifiesto. `sync.json` era el nombre viejo del manifiesto local; queda
 * en la lista para que un huérfano de la versión anterior no se suba.
 */
const DENYLIST = new Set(["appState.json", "account.json", "sync.json", MANIFEST_NAME]);

/** ¿La ruta relativa se sincroniza? (todo el árbol salvo lo device-local). */
function isManaged(relPath: string): boolean {
  return !DENYLIST.has(relPath);
}

export interface SyncProgress {
  /** "scanning": hasheo local; "transferring": subida/bajada/borrado. */
  phase: "scanning" | "transferring";
  /** Archivos procesados. */
  done: number;
  /** Total a procesar en esta fase. */
  total: number;
  /** Ruta del archivo en curso. */
  current?: string;
}

export interface SyncRunOptions {
  signal?: AbortSignal;
  onProgress?: (p: SyncProgress) => void;
}

/**
 * Diferencias entre el local (working tree) y la nube (baseline), agrupadas para
 * la UI. Mismo conjunto se interpreta en ambas direcciones:
 *   subir → added/modified suben, removed se borra de la nube;
 *   bajar → removed/modified bajan, added se borra del local.
 */
export interface SyncDelta {
  /** En tu PC y no en la nube (+ verde). */
  added: string[];
  /** En la nube y no en tu PC (− rojo). */
  removed: string[];
  /** En ambos lados pero distinto (● amarillo). */
  modified: string[];
}

export interface SyncPreview {
  delta: SyncDelta;
  /** Epoch ms de la última sincronización completada, o `null` si nunca. */
  lastSyncAt: number | null;
}

function isClean(d: SyncDelta): boolean {
  return d.added.length === 0 && d.removed.length === 0 && d.modified.length === 0;
}

const dirOf = (relPath: string) =>
  relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
const baseOf = (relPath: string) =>
  relPath.includes("/") ? relPath.slice(relPath.lastIndexOf("/") + 1) : relPath;

/** Lanza si el signal pidió cancelar (la clasificamos como cancelación, no error). */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Sincronización cancelada.", "AbortError");
}

/** ¿El error es un 401 de la Drive API? (token expirado / inválido). */
function isUnauthorized(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { status?: number }).status === 401;
}

/**
 * Token de acceso con auto-refresco para toda la operación. El provider es
 * stateless y recibe el token por argumento; acá lo mantenemos mutable y, ante
 * un 401, lo refrescamos y reintentamos la llamada UNA vez. Necesario porque una
 * subida de cientos de archivos dura más que la vida del access token (~1h): sin
 * esto, el token muere a mitad y todas las requests (y hasta el guardado del
 * manifiesto) fallan con 401, perdiendo el progreso.
 */
class TokenSession {
  constructor(private token: string) {}

  /** Ejecuta una llamada autenticada; ante 401 refresca el token y reintenta. */
  async run<T>(call: (token: string) => Promise<T>): Promise<T> {
    try {
      return await call(this.token);
    } catch (e) {
      if (!isUnauthorized(e)) throw e;
      const next = await refreshAccessToken();
      if (!next) throw e; // sin forma de refrescar: propagamos el 401 original.
      this.token = next;
      return await call(this.token);
    }
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copia para fijar el buffer a ArrayBuffer (digest pide BufferSource, no el
  // genérico Uint8Array<ArrayBufferLike> que devuelve el IO).
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Manifiesto local (en `manifest.json`, device-local: no se sincroniza) ─────
//
// Mismo concepto que el manifiesto en la nube (describe el árbol por SHA), pero
// del lado local y con un extra: guarda `mtime`+`size` por archivo para usarlos
// como clave de cache y no re-hashear lo que no cambió.

interface ManifestEntry {
  sha: string;
  /** Epoch ms del `mtime` y tamaño con que se calculó `sha` (clave de cache). */
  mtime: number;
  size: number;
}

interface LocalManifest {
  lastSyncAt: number | null;
  files: Record<string, ManifestEntry>;
}

const LOCAL_MANIFEST_DEFAULT: LocalManifest = { lastSyncAt: null, files: {} };

// La clave del store es el nombre sin extensión → `manifest.json` (raíz).
const LOCAL_MANIFEST_KEY = MANIFEST_NAME.replace(/\.json$/, "");

async function loadLocalManifest(): Promise<LocalManifest> {
  const m = await readJson<LocalManifest>(LOCAL_MANIFEST_KEY, LOCAL_MANIFEST_DEFAULT);
  return { lastSyncAt: m.lastSyncAt ?? null, files: m.files ?? {} };
}

const saveLocalManifest = (m: LocalManifest) =>
  writeJson<LocalManifest>(LOCAL_MANIFEST_KEY, m);

// ── Manifiesto en la nube ─────────────────────────────────────────────────────

interface RemoteEntry {
  sha: string;
  /** Id del archivo en Drive (para actualizar/borrar sin re-listar). */
  id: string;
}

interface CloudManifest {
  updatedAt: number;
  files: Record<string, RemoteEntry>;
}

/**
 * Describe el árbol remoto a partir del manifiesto en la nube (`manifest.json`).
 *
 * Si el manifiesto NO existe (primera vez / lo borraron) se asume **nube vacía**:
 * a propósito NO caminamos el árbol de Drive (sería lentísimo con cientos de
 * archivos y la barra de progreso se congelaría sin feedback). La primera Subir
 * crea el manifiesto y a partir de ahí el chequeo es bajar un único JSON.
 *
 * `manifestId` es el id del `manifest.json` actual (para actualizarlo en la
 * subida), o `null` si todavía no existe.
 */
async function fetchRemote(
  provider: SyncProvider,
  auth: TokenSession,
  rootId: string,
  signal?: AbortSignal,
): Promise<{ files: Map<string, RemoteEntry>; manifestId: string | null }> {
  const rootChildren = await auth.run((t) => provider.list(t, rootId, signal));
  const manifestRef = rootChildren.find((c) => !c.isFolder && c.name === MANIFEST_NAME);

  const files = new Map<string, RemoteEntry>();
  if (!manifestRef) return { files, manifestId: null };

  const bytes = await auth.run((t) => provider.download(t, manifestRef.id, signal));
  const json = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CloudManifest>;
  for (const [rel, entry] of Object.entries(json.files ?? {})) {
    if (isManaged(rel)) files.set(rel, entry);
  }
  return { files, manifestId: manifestRef.id };
}

/** Sube/actualiza `manifest.json` en la raíz de "Quarks". */
async function writeCloudManifest(
  provider: SyncProvider,
  auth: TokenSession,
  rootId: string,
  manifestId: string | null,
  files: Record<string, RemoteEntry>,
  signal?: AbortSignal,
): Promise<void> {
  const manifest: CloudManifest = { updatedAt: Date.now(), files };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  const sha = await sha256Hex(bytes);
  await auth.run((t) =>
    provider.upload(t, rootId, MANIFEST_NAME, bytes, sha, manifestId ?? undefined, signal),
  );
}

/** Asegura la cadena de subcarpetas de `relDir` y devuelve el id de la última. */
async function ensureFolderPath(
  provider: SyncProvider,
  auth: TokenSession,
  folders: Map<string, string>,
  relDir: string,
  signal?: AbortSignal,
): Promise<string> {
  if (relDir === "") return folders.get("")!;
  let parentId = folders.get("")!;
  let path = "";
  for (const seg of relDir.split("/")) {
    path = path ? `${path}/${seg}` : seg;
    let id = folders.get(path);
    if (!id) {
      const parent = parentId;
      id = (await auth.run((t) => provider.ensureFolder(t, seg, parent, signal))).id;
      folders.set(path, id);
    }
    parentId = id;
  }
  return parentId;
}

// ── Hasheo local (con cache por mtime+size) ───────────────────────────────────

/**
 * Hashea cada archivo del árbol local reutilizando el cache: si `mtime`+`size`
 * coinciden con el cache, no re-lee el contenido. Devuelve los SHA actuales y el
 * cache actualizado (para persistirlo tras la operación).
 */
async function gatherLocal(
  opts: SyncRunOptions,
  prev: Record<string, ManifestEntry>,
): Promise<{ shas: Map<string, string>; files: Record<string, ManifestEntry> }> {
  const all = (await listDataTree()).filter(isManaged);
  const shas = new Map<string, string>();
  const files: Record<string, ManifestEntry> = {};
  let done = 0;
  for (const rel of all) {
    throwIfAborted(opts.signal);
    opts.onProgress?.({ phase: "scanning", done, total: all.length, current: rel });
    const st = await statDataFile(rel);
    const cached = prev[rel];
    if (st && cached && cached.mtime === st.mtime && cached.size === st.size) {
      shas.set(rel, cached.sha);
      files[rel] = cached;
    } else {
      const bytes = await readDataFile(rel);
      if (bytes) {
        const sha = await sha256Hex(bytes);
        shas.set(rel, sha);
        files[rel] = { sha, mtime: st?.mtime ?? 0, size: st?.size ?? 0 };
      }
    }
    done++;
  }
  return { shas, files };
}

// ── Diff ──────────────────────────────────────────────────────────────────────

interface Diff {
  delta: SyncDelta;
  /** relPath → sha local. */
  local: Map<string, string>;
  remote: Map<string, RemoteEntry>;
  /** Cache local refrescado por `gatherLocal` (para persistir). */
  cacheFiles: Record<string, ManifestEntry>;
  provider: SyncProvider;
  /** Sesión con auto-refresco del token (sobrevive a la expiración mid-sync). */
  auth: TokenSession;
  rootId: string;
  manifestId: string | null;
  lastSyncAt: number | null;
}

/** Resuelve cuenta + token + estado remoto y arma el diff 2-vías por ruta. */
async function computeDiff(opts: SyncRunOptions): Promise<Diff> {
  const account = await loadAccount();
  if (!account) throw new Error("No hay una cuenta conectada.");
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error("La sesión expiró. Reconectá tu cuenta.");

  const provider = getSyncProvider(account.providerId);
  const auth = new TokenSession(accessToken);
  const root = await auth.run((t) => provider.ensureFolder(t, FOLDER_NAME, undefined, opts.signal));

  const cache = await loadLocalManifest();
  const { shas: local, files: cacheFiles } = await gatherLocal(opts, cache.files);
  const { files: remote, manifestId } = await fetchRemote(provider, auth, root.id, opts.signal);

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  for (const name of new Set<string>([...local.keys(), ...remote.keys()])) {
    const l = local.get(name);
    const r = remote.get(name);
    if (l !== undefined && r === undefined) added.push(name);
    else if (l === undefined && r !== undefined) removed.push(name);
    else if (l !== undefined && r !== undefined && l !== r.sha) modified.push(name);
  }
  added.sort();
  removed.sort();
  modified.sort();

  return {
    delta: { added, removed, modified },
    local,
    remote,
    cacheFiles,
    provider,
    auth,
    rootId: root.id,
    manifestId,
    lastSyncAt: cache.lastSyncAt,
  };
}

/** Calcula el resumen (sin modificar nada) para la UI. */
export async function computeSyncState(opts: SyncRunOptions = {}): Promise<SyncPreview> {
  const { delta, lastSyncAt } = await computeDiff(opts);
  return { delta, lastSyncAt };
}

// ── Operaciones (force) ───────────────────────────────────────────────────────

/** SUBIR: deja la nube idéntica a tu PC (sube altas/cambios, borra el resto). */
export async function push(opts: SyncRunOptions = {}): Promise<void> {
  const { signal, onProgress } = opts;
  const { delta, local, remote, cacheFiles, provider, auth, rootId, manifestId, lastSyncAt } =
    await computeDiff(opts);

  const folders = new Map<string, string>([["", rootId]]);
  // El manifiesto refleja el estado REAL de la nube: arranca como copia del
  // remoto y se muta con cada transferencia (alta/cambio → set, baja → delete).
  // Así, si se cancela a mitad, lo persistimos tal cual quedó la nube y el
  // reintento saltea lo ya hecho reusando los `id` de Drive (sin duplicar). Al
  // terminar con éxito, los `removed` ya se borraron y queda = tu PC.
  const manifest: Record<string, RemoteEntry> = {};
  for (const [rel, r] of remote) manifest[rel] = r;

  // Listados por carpeta (name→id), cargados on-demand. Antes de CREAR un alta,
  // reusamos un archivo del mismo nombre que ya exista en esa carpeta: recupera
  // subidas que quedaron en la nube pero no en el manifiesto (un sync que murió
  // antes de guardarlo) y evita duplicar ante CUALQUIER fallo, no solo la
  // cancelación limpia. Es un `list` por carpeta (no un recorrido del árbol).
  const listings = new Map<string, Map<string, { id: string; sha: string | null }>>();
  const findExisting = async (folderId: string, name: string) => {
    let listing = listings.get(folderId);
    if (!listing) {
      const children = await auth.run((tok) => provider.list(tok, folderId, signal));
      listing = new Map(
        children
          .filter((c) => !c.isFolder)
          .map((c) => [c.name, { id: c.id, sha: c.sha256 ?? null }]),
      );
      listings.set(folderId, listing);
    }
    return listing.get(name);
  };

  const todo = [
    ...delta.added.map((name) => ({ name, op: "upload" as const })),
    ...delta.modified.map((name) => ({ name, op: "upload" as const })),
    ...delta.removed.map((name) => ({ name, op: "delete" as const })),
  ];

  let done = 0;
  try {
    for (const t of todo) {
      throwIfAborted(signal);
      onProgress?.({ phase: "transferring", done, total: todo.length, current: t.name });
      if (t.op === "upload") {
        const parentId = await ensureFolderPath(provider, auth, folders, dirOf(t.name), signal);
        const name = baseOf(t.name);
        const sha = local.get(t.name)!;
        // id del manifiesto si lo conoce; si no, buscamos por nombre en la carpeta.
        let existingId = remote.get(t.name)?.id;
        if (!existingId) {
          const found = await findExisting(parentId, name);
          if (found?.sha === sha) {
            // Ya está idéntico en la nube (subido por un sync que no llegó a
            // guardar el manifiesto): no re-subimos, solo lo registramos.
            manifest[t.name] = { sha, id: found.id };
            done++;
            continue;
          }
          existingId = found?.id; // mismo nombre, distinto contenido → sobreescribir.
        }
        const bytes = await readDataFile(t.name);
        if (bytes) {
          const ref = await auth.run((tok) =>
            provider.upload(tok, parentId, name, bytes, sha, existingId, signal),
          );
          manifest[t.name] = { sha, id: ref.id };
        }
      } else {
        const id = remote.get(t.name)!.id;
        await auth.run((tok) => provider.delete(tok, id, signal));
        delete manifest[t.name];
      }
      done++;
    }
    // Éxito: el manifiesto refleja la nube completa = tu PC.
    await writeCloudManifest(provider, auth, rootId, manifestId, manifest, signal);
    await saveLocalManifest({ lastSyncAt: Date.now(), files: cacheFiles });
  } catch (e) {
    // Cancelado / error: persistimos el manifiesto con lo REALMENTE transferido
    // hasta acá (no el viejo), para que el reintento saltee lo ya subido/borrado y
    // reuse los `id` en vez de duplicar. Va SIN el `signal`: ya está abortado y, de
    // pasarlo, cancelaría también esta escritura. El cache de hashes se guarda
    // igual (el árbol local no cambió en un push).
    await writeCloudManifest(provider, auth, rootId, manifestId, manifest).catch(() => {});
    await saveLocalManifest({ lastSyncAt, files: cacheFiles }).catch(() => {});
    throw e;
  }
}

/** BAJAR: deja tu PC idéntica a la nube (baja altas/cambios, borra el resto). */
export async function pull(opts: SyncRunOptions = {}): Promise<void> {
  const { signal, onProgress } = opts;
  const { delta, remote, cacheFiles, provider, auth, lastSyncAt } = await computeDiff(opts);

  // El cache arranca del estado local actual y se va actualizando archivo a
  // archivo: una bajada cortada deja el cache consistente con el disco (reanudable).
  const files: Record<string, ManifestEntry> = { ...cacheFiles };

  const todo = [
    ...delta.removed.map((name) => ({ name, op: "download" as const })),
    ...delta.modified.map((name) => ({ name, op: "download" as const })),
    ...delta.added.map((name) => ({ name, op: "delete" as const })),
  ];

  let done = 0;
  try {
    for (const t of todo) {
      throwIfAborted(signal);
      onProgress?.({ phase: "transferring", done, total: todo.length, current: t.name });
      if (t.op === "download") {
        const r = remote.get(t.name)!;
        const bytes = await auth.run((tok) => provider.download(tok, r.id, signal));
        await writeDataFile(t.name, bytes);
        const st = await statDataFile(t.name);
        files[t.name] = { sha: r.sha || (await sha256Hex(bytes)), mtime: st?.mtime ?? 0, size: st?.size ?? 0 };
      } else {
        await deleteDataFile(t.name);
        delete files[t.name];
      }
      done++;
    }
    await saveLocalManifest({ lastSyncAt: Date.now(), files });
  } catch (e) {
    // Persistimos el progreso parcial (lo ya bajado/borrado) para reanudar.
    await saveLocalManifest({ lastSyncAt, files }).catch(() => {});
    throw e;
  }
}

export { isClean };
