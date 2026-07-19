/**
 * Render de Markdown para los mensajes del asistente. Usa react-markdown +
 * remark-gfm (tablas, listas de tareas, ~tachado~, autolinks). El estilado vive
 * en `markdown.css` (clase `.q-md`).
 *
 * Links: en un WebView, un `<a href>` normal navegaría toda la ventana fuera de
 * la app. Los interceptamos y los abrimos en el navegador del SO vía el plugin
 * opener, restringido a http(s).
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { report } from "../../../services/log";
import "./markdown.css";

async function openExternal(url: string) {
  // Solo http(s): evita `file://`, `javascript:` y demás esquemas raros que
  // pudiera emitir el modelo.
  if (!/^https?:\/\//i.test(url)) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch (e) {
    report("quarky.markdown.openLink", e);
  }
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="q-md q-selectable">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                e.preventDefault();
                if (href) void openExternal(href);
              }}
            >
              {children}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
