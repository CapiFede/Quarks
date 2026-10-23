/**
 * Abstracción de "provider de cuenta" para la feature Account (sync genérico).
 *
 * Hoy el único provider es Google Drive, pero la feature se modela genérica: un
 * provider sabe autenticar (`connect`/`refresh`/`revoke`) y describir la
 * identidad de la cuenta (`fetchIdentity`). El motor de sync vive en
 * `SyncProvider` (declarado acá, implementado en el Paso 2).
 *
 * Convención de secretos en el keyring (ver `secrets.ts`): los tokens van bajo
 * `drive.accessToken` / `drive.refreshToken`; la metadata no-secreta
 * (`AccountInfo`) va en `data/account.json` vía el store.
 */

/** Identificador de provider. Union extensible (futuro: NAS, WebDAV…). */
export type ProviderId = "google-drive";

/** Tokens OAuth de una cuenta. NUNCA se persisten en JSON: van al keyring. */
export interface AccountTokens {
  accessToken: string;
  /** Puede faltar si Google no devolvió uno (login sin `prompt=consent`). */
  refreshToken: string | null;
  /** Epoch ms en que expira el `accessToken`. */
  expiresAt: number;
}

/** Identidad mínima de la cuenta conectada. */
export interface AccountIdentity {
  email: string;
  name: string;
}

/** Metadata no-secreta de la cuenta, persistida en `data/account.json`. */
export interface AccountInfo {
  providerId: ProviderId;
  /** Etiqueta legible del provider, p. ej. "Google Drive". */
  providerLabel: string;
  email: string;
  name: string;
  /** Epoch ms de expiración del access token (para refresco perezoso). */
  expiresAt: number;
}

/** Estado del flujo de conexión, para la UI. */
export type AccountStatus = "disconnected" | "connecting" | "connected" | "error";

/** Capacidad de autenticación de un provider. */
export interface AccountProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Corre el flujo OAuth completo y devuelve identidad + tokens. */
  connect(): Promise<{ identity: AccountIdentity; tokens: AccountTokens }>;
  /** Renueva el access token a partir del refresh token. */
  refresh(refreshToken: string): Promise<AccountTokens>;
  /** Revoca los tokens en el provider (best-effort). */
  revoke(tokens: AccountTokens): Promise<void>;
  /** Lee nombre y email de la cuenta dueña del access token. */
  fetchIdentity(accessToken: string): Promise<AccountIdentity>;
}

/** Referencia a un archivo (o carpeta) en la nube, usada por el motor de sync. */
export interface DriveFileRef {
  id: string;
  name: string;
  /** SHA-256 hex del contenido, guardado por la app en `appProperties`. */
  sha256?: string | null;
  /** `true` si es una carpeta (el engine recorre el árbol con esto). */
  isFolder: boolean;
}

/**
 * Provider con motor de sync. Todos los métodos reciben el `accessToken` como
 * primer argumento: el provider es stateless y el engine (`sync.ts`) resuelve el
 * token una vez por operación (evita un ciclo provider→facade→registry→provider).
 */
export interface SyncProvider extends AccountProvider {
  /**
   * Asegura una carpeta `name` (la crea si no existe). Sin `parentId` opera en la
   * raíz del Drive (carpeta tope "Quarks"); con `parentId` crea la subcarpeta ahí.
   */
  ensureFolder(
    accessToken: string,
    name: string,
    parentId?: string,
    signal?: AbortSignal,
  ): Promise<DriveFileRef>;
  /** Lista los hijos directos de la carpeta (archivos y subcarpetas). */
  list(accessToken: string, folderId: string, signal?: AbortSignal): Promise<DriveFileRef[]>;
  /** Crea (sin `existingId`) o actualiza el archivo; graba `sha256` como metadata. */
  upload(
    accessToken: string,
    folderId: string,
    name: string,
    data: Uint8Array,
    sha256: string,
    existingId?: string,
    signal?: AbortSignal,
  ): Promise<DriveFileRef>;
  /** Descarga el contenido del archivo. */
  download(accessToken: string, fileId: string, signal?: AbortSignal): Promise<Uint8Array>;
  /** Manda el archivo a la papelera de la nube (propagación de borrados). */
  delete(accessToken: string, fileId: string, signal?: AbortSignal): Promise<void>;
}
