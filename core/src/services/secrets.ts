/**
 * Secretos (API keys, tokens OAuth) en el almacén nativo del SO.
 *
 * Envuelve los comandos Tauri definidos en `src-tauri/src/secrets.rs`, que en
 * Windows usan el Credential Manager vía la crate `keyring`. Los secretos
 * NUNCA se escriben en JSON.
 *
 * Convención de claves: `<dominio>.<nombre>`, p. ej. `quarky.apiKey`,
 * `drive.accessToken`. Fuera de Tauri las operaciones son no-op / `null`.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";

export async function setSecret(key: string, value: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("secret_set", { key, value });
}

export async function getSecret(key: string): Promise<string | null> {
  if (!isTauri()) return null;
  return (await invoke<string | null>("secret_get", { key })) ?? null;
}

export async function deleteSecret(key: string): Promise<void> {
  if (!isTauri()) return;
  await invoke("secret_delete", { key });
}
