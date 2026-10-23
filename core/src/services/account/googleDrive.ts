/**
 * Provider de Google Drive: login OAuth (PKCE), identidad y sync.
 *
 * Hay dos flows de login según plataforma (Google los obliga):
 *   - Desktop: loopback HTTP en 127.0.0.1:port (`tauri-plugin-oauth`). El
 *     browser del SO redirige al puerto local, el server captura el code.
 *   - Android: custom URI scheme (`com.googleusercontent.apps.<ID>:/...`).
 *     Chrome redirige al scheme, Android dispara un intent que vuelve a la
 *     app y `tauri-plugin-deep-link` nos entrega la URL con el code.
 *
 * Lo demás es común: auth URL, token exchange, userinfo, refresh, revoke y la
 * Drive API corren en TS vía `@tauri-apps/plugin-http`, cuyo `fetch` evita el
 * CORS que bloquearía estos endpoints desde el webview.
 *
 * Implementa `SyncProvider`: además del login, expone las primitivas de archivos
 * (ensureFolder/list/upload/download/delete) que usa el motor de sync (`sync.ts`).
 * Con scope `drive.file` solo vemos los archivos creados por la app, así que la
 * carpeta "Quarks" y su contenido quedan aislados del resto del Drive del user.
 */
import { isTauri } from "@tauri-apps/api/core";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_SCOPES,
  androidRedirectUri,
} from "./config";
import { isAndroid } from "../platform";
import { challengeFromVerifier, generateVerifier, randomState } from "./pkce";
import type {
  AccountIdentity,
  AccountTokens,
  DriveFileRef,
  SyncProvider,
} from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** Tipo genérico para subir cualquier archivo (json, mp3, etc.) de forma binaria. */
const UPLOAD_MIME = "application/octet-stream";
/** Campos que pedimos de cada archivo (incluye `appProperties` con el sha256). */
const FILE_FIELDS = "id,name,mimeType,appProperties";

/** El usuario tiene 3 minutos para completar el consent en el browser. */
const LOGIN_TIMEOUT_MS = 180_000;

/** Respuesta cruda del token endpoint de Google (campos que usamos). */
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/** `fetch` del plugin HTTP de Tauri (no el del webview: evita CORS). */
async function http() {
  const { fetch } = await import("@tauri-apps/plugin-http");
  return fetch;
}

function buildAuthUrl(challenge: string, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    // `offline` + `consent` son necesarios para que Google devuelva refresh_token.
    access_type: "offline",
    prompt: "consent",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

function tokensFromResponse(
  json: TokenResponse,
  prevRefreshToken: string | null = null,
): AccountTokens {
  return {
    accessToken: json.access_token,
    // En un refresh Google no reenvía el refresh_token: preservamos el previo.
    refreshToken: json.refresh_token ?? prevRefreshToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
}

async function postForm(url: string, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams(fields);
  if (GOOGLE_CLIENT_SECRET) body.set("client_secret", GOOGLE_CLIENT_SECRET);
  const fetch = await http();
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
}

async function exchangeCode(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<AccountTokens> {
  const res = await postForm(TOKEN_ENDPOINT, {
    client_id: GOOGLE_CLIENT_ID,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (!res.ok) {
    throw new Error(`Falló el intercambio de tokens (${res.status}): ${await res.text()}`);
  }
  return tokensFromResponse((await res.json()) as TokenResponse);
}

/**
 * Espera la redirect del loopback (desktop). Registra los listeners ANTES de
 * abrir el browser (para no perder la respuesta) y limpia todo en `finally`.
 */
async function awaitRedirectLoopback(authUrl: string, port: number): Promise<URL> {
  const { cancel, onUrl, onInvalidUrl } = await import("@fabianlars/tauri-plugin-oauth");
  const { openUrl } = await import("@tauri-apps/plugin-opener");

  let unlistenUrl: (() => void) | undefined;
  let unlistenInvalid: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const redirected = await new Promise<string>((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Se agotó el tiempo de espera del login (3 min).")),
        LOGIN_TIMEOUT_MS,
      );
      Promise.all([
        onUrl((url) => resolve(url)),
        // Pings sin parámetros (favicon, etc.): se ignoran, no son la redirect.
        onInvalidUrl(() => {}),
      ])
        .then(([u1, u2]) => {
          unlistenUrl = u1;
          unlistenInvalid = u2;
          return openUrl(authUrl);
        })
        .catch(reject);
    });
    return new URL(redirected);
  } finally {
    if (timer) clearTimeout(timer);
    unlistenUrl?.();
    unlistenInvalid?.();
    await cancel(port).catch(() => {});
  }
}

/**
 * Espera la redirect via deep link (Android). El intent-filter del manifest
 * captura `com.googleusercontent.apps.<ID>:/oauth2redirect` y nos lo entrega de
 * dos formas, porque el navegador externo abre como tarea aparte:
 *   1. `onOpenUrl`: evento en caliente, cuando el plugin alcanza a emitirlo.
 *   2. `getCurrent`: la URL del último intent, que el plugin guarda aunque el
 *      evento NO dispare (caso típico al volver desde otra tarea con el flag
 *      BROUGHT_TO_FRONT). La re-chequeamos cada vez que la app vuelve a primer
 *      plano (`visibilitychange`).
 * Lo que resuelva primero gana. Registramos todo ANTES de abrir el browser para
 * no perder el evento, filtramos por el scheme exacto y limpiamos en `finally`.
 */
async function awaitRedirectDeepLink(authUrl: string, expectedScheme: string): Promise<URL> {
  const { onOpenUrl, getCurrent } = await import("@tauri-apps/plugin-deep-link");
  const { openUrl } = await import("@tauri-apps/plugin-opener");

  let unlisten: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onVisible: (() => void) | undefined;

  try {
    const redirected = await new Promise<string>((resolve, reject) => {
      const tryUrls = (urls: string[] | null | undefined): void => {
        const match = urls?.find((u) => u.startsWith(`${expectedScheme}:`));
        if (match) resolve(match);
      };

      timer = setTimeout(
        () => reject(new Error("Se agotó el tiempo de espera del login (3 min).")),
        LOGIN_TIMEOUT_MS,
      );

      // Red de seguridad: si volvemos desde un browser externo y el evento
      // `onOpenUrl` no alcanza a dispararse, el intent ya quedó en `getCurrent`.
      onVisible = () => {
        if (document.visibilityState === "visible") {
          getCurrent().then(tryUrls).catch(() => {});
        }
      };
      document.addEventListener("visibilitychange", onVisible);

      onOpenUrl(tryUrls)
        .then((u) => {
          unlisten = u;
          return openUrl(authUrl);
        })
        .catch(reject);
    });
    return new URL(redirected);
  } finally {
    if (timer) clearTimeout(timer);
    if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    unlisten?.();
  }
}

// ── Drive API ─────────────────────────────────────────────────────────────────

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  appProperties?: Record<string, string>;
}

function toRef(f: DriveFile): DriveFileRef {
  return {
    id: f.id,
    name: f.name,
    sha256: f.appProperties?.sha256 ?? null,
    isFolder: f.mimeType === FOLDER_MIME,
  };
}

interface DriveRequest {
  method?: string;
  headers?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

/**
 * `fetch` autenticado contra la Drive API; lanza con el cuerpo de error.
 *
 * Cancelación POR REQUEST, no por operación: el `signal` compartido de toda la
 * sync NO se pasa directo al plugin HTTP. Ese plugin engancha un listener de
 * `abort` por request y NUNCA lo desengancha, así que al cancelar disparaba un
 * `fetch_cancel` por CADA request ya terminada, sobre `rid`s ya liberados → una
 * lluvia de "The resource id N is invalid" como `unhandledrejection`. Acá cada
 * llamada usa un AbortController propio y solo reenvía el abort del padre
 * mientras está en vuelo; al terminar lo desengancha. Cancelar aborta solo la
 * request actual (rid vivo); las completadas no disparan nada.
 */
async function driveFetch(
  accessToken: string,
  url: string,
  init: DriveRequest = {},
): Promise<Response> {
  const parent = init.signal;
  if (parent?.aborted) throw new DOMException("Request cancelled", "AbortError");

  const local = parent ? new AbortController() : undefined;
  const forward = () => local!.abort(parent!.reason);
  if (parent) parent.addEventListener("abort", forward, { once: true });

  const fetch = await http();
  try {
    const res = await fetch(url, {
      method: init.method,
      body: init.body,
      signal: local?.signal,
      headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      // `status` queda accesible para el engine (reintenta y refresca ante 401).
      const err: Error & { status?: number } = new Error(
        `Drive API ${res.status}: ${await res.text()}`,
      );
      err.status = res.status;
      throw err;
    }
    return res;
  } finally {
    if (parent) parent.removeEventListener("abort", forward);
  }
}

export const googleDriveProvider: SyncProvider = {
  id: "google-drive",
  label: "Google Drive",

  async connect() {
    if (!isTauri()) {
      throw new Error("Conectar una cuenta requiere la app instalada.");
    }

    const verifier = generateVerifier();
    const challenge = await challengeFromVerifier(verifier);
    const state = randomState();

    // Cada plataforma usa su flow nativo:
    //   - Desktop: levanta un loopback en 127.0.0.1:port y arma el redirect_uri
    //     con ese puerto.
    //   - Android: redirect_uri es el reversed-client-id URI, capturado por el
    //     intent-filter del AndroidManifest y el plugin deep-link.
    let url: URL;
    let redirectUri: string;
    if (isAndroid) {
      redirectUri = androidRedirectUri();
      const authUrl = buildAuthUrl(challenge, state, redirectUri);
      // El scheme esperado en el deep link es la parte antes del primer ':'.
      const scheme = redirectUri.split(":")[0];
      url = await awaitRedirectDeepLink(authUrl, scheme);
    } else {
      const { start } = await import("@fabianlars/tauri-plugin-oauth");
      const port = await start();
      // redirect_uri byte-idéntico entre auth URL y token exchange (sin path).
      redirectUri = `http://127.0.0.1:${port}`;
      const authUrl = buildAuthUrl(challenge, state, redirectUri);
      url = await awaitRedirectLoopback(authUrl, port);
    }

    const params = url.searchParams;
    const error = params.get("error");
    if (error) throw new Error(`Google rechazó la autorización: ${error}`);
    if (params.get("state") !== state) {
      throw new Error("La validación de estado falló (posible CSRF).");
    }
    const code = params.get("code");
    if (!code) throw new Error("No se recibió el código de autorización.");

    const tokens = await exchangeCode(code, verifier, redirectUri);
    const identity = await this.fetchIdentity(tokens.accessToken);
    return { identity, tokens };
  },

  async refresh(refreshToken) {
    const res = await postForm(TOKEN_ENDPOINT, {
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    if (!res.ok) {
      throw new Error(`Falló el refresco del token (${res.status}): ${await res.text()}`);
    }
    return tokensFromResponse((await res.json()) as TokenResponse, refreshToken);
  },

  async revoke(tokens) {
    if (!isTauri()) return;
    const token = tokens.refreshToken ?? tokens.accessToken;
    if (!token) return;
    try {
      const fetch = await http();
      await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      });
    } catch {
      // Best-effort: si falla, igual borramos los secretos locales.
    }
  },

  async fetchIdentity(accessToken): Promise<AccountIdentity> {
    const fetch = await http();
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`No se pudo leer la identidad de la cuenta (${res.status}).`);
    }
    const json = (await res.json()) as { email?: string; name?: string };
    return {
      email: json.email ?? "",
      name: json.name ?? json.email ?? "",
    };
  },

  async ensureFolder(accessToken, name, parentId, signal): Promise<DriveFileRef> {
    const clauses = [`name='${name}'`, `mimeType='${FOLDER_MIME}'`, "trashed=false"];
    if (parentId) clauses.push(`'${parentId}' in parents`);
    const q = clauses.join(" and ");
    const url = `${DRIVE_FILES}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(${FILE_FIELDS})`;
    const res = await driveFetch(accessToken, url, { signal });
    const { files } = (await res.json()) as { files: DriveFile[] };
    if (files.length > 0) return toRef(files[0]);

    const metadata = {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    };
    const created = await driveFetch(accessToken, `${DRIVE_FILES}?fields=${FILE_FIELDS}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
      signal,
    });
    return toRef((await created.json()) as DriveFile);
  },

  async list(accessToken, folderId, signal): Promise<DriveFileRef[]> {
    const out: DriveFileRef[] = [];
    let pageToken: string | undefined;
    do {
      // Incluye subcarpetas: el engine recorre el árbol (carpeta por quark) y
      // distingue archivo de carpeta por `isFolder` (mimeType).
      const q = `'${folderId}' in parents and trashed=false`;
      const params = new URLSearchParams({
        q,
        spaces: "drive",
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        pageSize: "1000",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await driveFetch(accessToken, `${DRIVE_FILES}?${params.toString()}`, { signal });
      const json = (await res.json()) as {
        files: DriveFile[];
        nextPageToken?: string;
      };
      for (const f of json.files) out.push(toRef(f));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return out;
  },

  async upload(accessToken, folderId, name, data, sha256, existingId, signal): Promise<DriveFileRef> {
    // 1) Metadata (incluye el sha256 como appProperties para comparar luego).
    const metaUrl = existingId
      ? `${DRIVE_FILES}/${existingId}?fields=${FILE_FIELDS}`
      : `${DRIVE_FILES}?fields=${FILE_FIELDS}`;
    const metadata = existingId
      ? { appProperties: { sha256 } }
      : { name, parents: [folderId], appProperties: { sha256 } };
    const metaRes = await driveFetch(accessToken, metaUrl, {
      method: existingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
      signal,
    });
    const file = (await metaRes.json()) as DriveFile;

    // 2) Contenido (uploadType=media sobre el id recién creado/existente).
    const mediaRes = await driveFetch(
      accessToken,
      `${DRIVE_UPLOAD}/${file.id}?uploadType=media&fields=${FILE_FIELDS}`,
      {
        method: "PATCH",
        // Genérico binario: sirve para json, mp3, lo que sea.
        headers: { "Content-Type": UPLOAD_MIME },
        // Copia para fijar el buffer a ArrayBuffer (BodyInit no acepta el genérico
        // Uint8Array<ArrayBufferLike> que devuelve el IO).
        body: new Uint8Array(data),
        signal,
      },
    );
    return toRef((await mediaRes.json()) as DriveFile);
  },

  async download(accessToken, fileId, signal): Promise<Uint8Array> {
    const res = await driveFetch(accessToken, `${DRIVE_FILES}/${fileId}?alt=media`, { signal });
    return new Uint8Array(await res.arrayBuffer());
  },

  async delete(accessToken, fileId, signal): Promise<void> {
    // Papelera, no borrado permanente: recuperable desde Drive si el sync se
    // equivoca. `list` filtra `trashed=false`, así que desaparece de la sync igual.
    await driveFetch(accessToken, `${DRIVE_FILES}/${fileId}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
      signal,
    });
  },
};
