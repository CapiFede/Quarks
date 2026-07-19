/**
 * PKCE (RFC 7636) y `state` anti-CSRF para el flujo OAuth, con Web Crypto.
 *
 * Sin dependencias de Tauri: corre igual en la app y en el browser. El
 * `verifier` se genera en el cliente, se manda hasheado (`challenge`, S256) en
 * la auth URL y en claro en el token exchange; Google verifica que coincidan.
 */

/** base64url sin padding, a partir de bytes. */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Code verifier: 32 bytes aleatorios → base64url (43 chars). */
export function generateVerifier(): string {
  return base64url(randomBytes(32));
}

/** Code challenge: SHA-256 del verifier → base64url. */
export async function challengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(digest));
}

/** Valor `state` aleatorio para detectar respuestas no solicitadas. */
export function randomState(): string {
  return base64url(randomBytes(16));
}
