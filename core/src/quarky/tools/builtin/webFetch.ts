/**
 * `web_fetch`: descarga el texto de una URL HTTP/HTTPS.
 *
 * Disponible en Ask Y Agent (read-only). Va por `@tauri-apps/plugin-http` para
 * esquivar CORS — la URL la decide el modelo, pero el scope la limita al
 * pattern `https://**` definido en `src-tauri/capabilities/default.json`.
 *
 * Trunca el response a 64 KB para no inundar el contexto. Si el content-type es
 * text/html, sería ideal convertir a markdown — pero para no agregar dependency
 * (turndown.js o similar) por ahora devolvemos el HTML crudo y dejamos que el
 * modelo lo digiera. Funciona bien con LLMs modernos.
 */
import type { ToolDef } from "../types";
import { messageOf } from "../../../services/util";

const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 15_000;

interface Args {
  url: string;
}

export const webFetch: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "web_fetch",
      description:
        "Descarga el contenido de una URL HTTPS (HTML o texto plano). Trunca a 64 KB. Tiene timeout de 15 segundos.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL completa, debe ser HTTPS." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, ctx) {
    const { url } = rawArgs as Args;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { content: `web_fetch: URL inválida \`${url}\``, isError: true };
    }
    if (parsed.protocol !== "https:") {
      return {
        content: `web_fetch: solo se permite HTTPS (vino ${parsed.protocol}).`,
        isError: true,
      };
    }

    const { fetch } = await import("@tauri-apps/plugin-http");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const signal = mergeSignals(ctrl.signal, ctx.signal);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "Quarks/Quarky" },
        signal,
      });
      if (!res.ok) {
        return {
          content: `web_fetch: ${url} → ${res.status} ${res.statusText}`,
          isError: true,
        };
      }
      let text = await res.text();
      let truncated = false;
      if (text.length > MAX_BYTES) {
        text = text.slice(0, MAX_BYTES);
        truncated = true;
      }
      const header = `# ${url}\n# content-type: ${res.headers.get("content-type") ?? "?"}${truncated ? ` · truncado a ${MAX_BYTES} chars` : ""}\n\n`;
      return { content: header + text };
    } catch (e) {
      const msg = messageOf(e);
      return { content: `web_fetch: falló ${url} (${msg})`, isError: true };
    } finally {
      clearTimeout(timer);
    }
  },
};

/** AbortSignal combinado: cancela si CUALQUIERA de los dos cancela. */
function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}
