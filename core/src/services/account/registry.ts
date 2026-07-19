/**
 * Registro de providers de cuenta. Seam para sumar providers (NAS, WebDAV) sin
 * tocar la facade ni la UI: alcanza con registrarlos acá.
 */
import { googleDriveProvider } from "./googleDrive";
import type { AccountProvider, ProviderId, SyncProvider } from "./types";

/** Provider por defecto cuando no se especifica uno. */
export const DEFAULT_PROVIDER_ID: ProviderId = "google-drive";

const PROVIDERS: Record<ProviderId, AccountProvider> = {
  "google-drive": googleDriveProvider,
};

/** Devuelve el provider para `id`. Lanza si no existe (programación). */
export function getProvider(id: ProviderId): AccountProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Provider de cuenta desconocido: ${id}`);
  return provider;
}

/** ¿El provider soporta sync (motor de archivos), no solo auth? */
export function isSyncProvider(provider: AccountProvider): provider is SyncProvider {
  return typeof (provider as SyncProvider).list === "function";
}

/** Devuelve el provider como `SyncProvider`; lanza si no soporta sync. */
export function getSyncProvider(id: ProviderId): SyncProvider {
  const provider = getProvider(id);
  if (!isSyncProvider(provider)) {
    throw new Error(`El provider "${id}" no soporta sincronización.`);
  }
  return provider;
}
