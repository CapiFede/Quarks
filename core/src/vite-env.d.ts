/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID de Google (client tipo "Desktop app"). */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Client secret del client Desktop; opcional (no es confidencial). */
  readonly VITE_GOOGLE_CLIENT_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Inyectado por vite (define) desde core/package.json en build time. */
declare const __APP_VERSION__: string;
