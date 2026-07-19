/**
 * Configuración OAuth de Google, tomada de variables de entorno Vite.
 *
 * Las credenciales viven en `core/.env` (gitignored; ver `core/.env.example`).
 *
 * Hay dos clients OAuth distintos según plataforma (Google los obliga):
 *   - Desktop: tipo "Desktop app", flow PKCE + loopback HTTP (127.0.0.1:port).
 *     El `client_secret` no es confidencial; si tu client no lo requiere, dejá
 *     la var vacía.
 *   - Android: tipo "Android" (package + SHA-1 fingerprint, sin client_secret).
 *     El redirect URI es `com.googleusercontent.apps.<ID>:/oauth2redirect`
 *     (reversed client ID); ver `account/googleDrive.ts` + AndroidManifest.xml.
 */
import { isAndroid } from "../platform";

const DESKTOP_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const DESKTOP_CLIENT_SECRET = import.meta.env.VITE_GOOGLE_CLIENT_SECRET ?? "";
const ANDROID_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID_ANDROID ?? "";

/** Client ID a usar según la plataforma activa. */
export const GOOGLE_CLIENT_ID = isAndroid ? ANDROID_CLIENT_ID : DESKTOP_CLIENT_ID;

/**
 * Client secret. En Android NO se usa (los Android clients de Google no
 * llevan secret); en desktop puede ser vacío si tu client no lo requiere.
 */
export const GOOGLE_CLIENT_SECRET = isAndroid ? "" : DESKTOP_CLIENT_SECRET;

/**
 * Redirect URI para Android: `com.googleusercontent.apps.<reversed-id>:/oauth2redirect`.
 * El "reversed id" es el client_id sin el sufijo `.apps.googleusercontent.com`,
 * usado como scheme inverso de dominio. Tiene que coincidir EXACTO con el
 * `<data android:scheme=...>` del intent-filter en AndroidManifest.xml.
 */
export function androidRedirectUri(): string {
  const suffix = ".apps.googleusercontent.com";
  const reversed = ANDROID_CLIENT_ID.endsWith(suffix)
    ? ANDROID_CLIENT_ID.slice(0, -suffix.length)
    : ANDROID_CLIENT_ID;
  return `com.googleusercontent.apps.${reversed}:/oauth2redirect`;
}

/**
 * Scopes solicitados:
 *   - `drive.file`: acceso solo a los archivos que la app crea (no a todo Drive).
 *   - `openid email profile`: identidad de la cuenta (nombre + email).
 */
export const GOOGLE_SCOPES =
  "https://www.googleapis.com/auth/drive.file openid email profile";

/** Hay credenciales suficientes para intentar el login. */
export function hasGoogleCredentials(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}
