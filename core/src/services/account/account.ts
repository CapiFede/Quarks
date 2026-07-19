/**
 * Facade de la feature Account: orquesta provider + persistencia.
 *
 * Reparto de almacenamiento:
 *   - Metadata no-secreta (`AccountInfo`) → `account.json` (raíz, device-local:
 *     NO sincroniza) vía `store.ts`.
 *   - Tokens OAuth → keyring del SO vía `secrets.ts` (`drive.accessToken`,
 *     `drive.refreshToken`). Nunca tocan el disco en claro.
 *
 * `getAccessToken()` es el seam para el motor de sync del Paso 2: refresca el
 * token si está por expirar y devuelve uno usable.
 */
import { existsJson, readJson, writeJson } from "../store";
import { deleteSecret, getSecret, setSecret } from "../secrets";
import { DEFAULT_PROVIDER_ID, getProvider } from "./registry";
import type { AccountInfo, AccountTokens, ProviderId } from "./types";

const FILE = "account";
const ACCESS_TOKEN_KEY = "drive.accessToken";
const REFRESH_TOKEN_KEY = "drive.refreshToken";

/** Margen para refrescar antes de que el token expire de verdad. */
const REFRESH_MARGIN_MS = 60_000;

interface AccountFile {
  account: AccountInfo | null;
}

const DEFAULTS: AccountFile = { account: null };

/** Lee la metadata de la cuenta conectada (o `null`). */
export async function loadAccount(): Promise<AccountInfo | null> {
  const data = await readJson<AccountFile>(FILE, DEFAULTS);
  return data.account ?? null;
}

/** Crea `account.json` vacío (sin cuenta) si todavía no existe (arranque). */
export async function ensureAccountFile(): Promise<void> {
  if (!(await existsJson(FILE))) await writeJson<AccountFile>(FILE, DEFAULTS);
}

/** Corre el login del provider, persiste tokens + metadata y devuelve la info. */
export async function connect(
  providerId: ProviderId = DEFAULT_PROVIDER_ID,
): Promise<AccountInfo> {
  const provider = getProvider(providerId);
  const { identity, tokens } = await provider.connect();
  await persistTokens(tokens);
  const info: AccountInfo = {
    providerId: provider.id,
    providerLabel: provider.label,
    email: identity.email,
    name: identity.name,
    expiresAt: tokens.expiresAt,
  };
  await writeJson<AccountFile>(FILE, { account: info });
  return info;
}

/** Revoca en el provider, borra los secretos y limpia la metadata. */
export async function disconnect(): Promise<void> {
  const info = await loadAccount();
  if (info) {
    const tokens = await loadTokens(info.expiresAt);
    if (tokens) await getProvider(info.providerId).revoke(tokens);
  }
  await deleteSecret(ACCESS_TOKEN_KEY);
  await deleteSecret(REFRESH_TOKEN_KEY);
  await writeJson<AccountFile>(FILE, { account: null });
}

/**
 * Devuelve un access token usable, refrescándolo si está por expirar (refresco
 * perezoso por `expiresAt`). Para forzar un refresco tras un 401 en pleno sync,
 * ver `refreshAccessToken`.
 */
export async function getAccessToken(): Promise<string | null> {
  const info = await loadAccount();
  if (!info) return null;
  const tokens = await loadTokens(info.expiresAt);
  if (!tokens) return null;

  if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens.accessToken;
  if (!tokens.refreshToken) return tokens.accessToken; // sin RT no hay refresco
  return refreshWith(info, tokens.refreshToken);
}

/**
 * Fuerza un refresco del access token y devuelve el nuevo (ignora `expiresAt`).
 * Lo usa el motor de sync cuando una request devuelve 401: en una subida larga
 * (cientos de archivos) el token expira a mitad y hay que renovarlo sin abortar.
 * Devuelve `null` si no hay forma de refrescar (sin cuenta o sin refresh token).
 */
export async function refreshAccessToken(): Promise<string | null> {
  const info = await loadAccount();
  if (!info) return null;
  const tokens = await loadTokens(info.expiresAt);
  if (!tokens?.refreshToken) return null;
  return refreshWith(info, tokens.refreshToken);
}

/** Refresca con el provider, persiste el token nuevo y su `expiresAt`. */
async function refreshWith(info: AccountInfo, refreshToken: string): Promise<string> {
  const next = await getProvider(info.providerId).refresh(refreshToken);
  await persistTokens(next);
  await writeJson<AccountFile>(FILE, {
    account: { ...info, expiresAt: next.expiresAt },
  });
  return next.accessToken;
}

async function persistTokens(tokens: AccountTokens): Promise<void> {
  await setSecret(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) await setSecret(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** Reconstruye los tokens desde el keyring; `expiresAt` viene de la metadata. */
async function loadTokens(expiresAt: number): Promise<AccountTokens | null> {
  const accessToken = await getSecret(ACCESS_TOKEN_KEY);
  if (!accessToken) return null;
  const refreshToken = await getSecret(REFRESH_TOKEN_KEY);
  return { accessToken, refreshToken, expiresAt };
}
