/**
 * Export del libro a PDF via `window.print()` en un iframe oculto.
 *
 * Estrategia: el padre pre-renderiza markdown a HTML y lo embebe oculto en el
 * iframe junto con un script de paginación que corre AHÍ MISMO. El script
 * agrega elemento por elemento (cada `<p>`, `<h1>`, `<ul>`, etc.) a la página
 * actual; si la próxima adición rebasa el alto disponible, hace rollback y
 * empieza nueva página. Como la medición pasa en el mismo contexto que el
 * render (mismas fuentes, mismo CSS, mismo layout engine), no hay drift entre
 * lo medido y lo dibujado.
 *
 * Ignoramos TODOS los `\f` del editor (tanto auto como manuales). El editor
 * los inserta cuando su textarea desborda; el modelo de altura del textarea
 * (líneas crudas con blank-line de 25.5px) difiere del prose (párrafos con
 * margin de 12px), así que respetar esos cortes deja páginas semi-vacías en
 * el PDF. Paginamos cada capítulo de corrido por la altura real del prose,
 * cortando a nivel de párrafo — más natural visualmente.
 *
 * El usuario elige "Guardar como PDF" en el diálogo nativo.
 */
import { readChapter } from "../services/persistence";
import type { Book, Chapter, Typography } from "../types";
import { markdownToHtml } from "./markdown";

/**
 * Alto útil reservado para el prose dentro del card. Card 810px con padding
 * simétrico 56/56 = 698px geométricos. El script de paginación corre en el
 * iframe y compara `prose.scrollHeight` contra este límite — como mide en el
 * mismo contexto que el render, no necesita buffer.
 */
const PROSE_MAX_HEIGHT = 698;

const ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);

interface LoadedChapter {
  title: string;
  content: string;
}

/** Stack CSS de cada familia para el PDF (debe espejar los tokens del editor). */
const SERIF_STACK = "'Lora', Georgia, 'Times New Roman', serif";
const SANS_STACK = "'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * Recolecta las reglas `@font-face` de las familias pedidas desde las
 * hojas de estilo del documento padre, descarga cada `.woff2` (mismo origen,
 * son assets bundleados) y las reescribe con la fuente embebida como data-URI.
 *
 * Así el PDF lleva las fuentes adentro y NO depende del CDN de Google Fonts:
 * funciona offline y matchea exactamente lo que se ve en el editor.
 */
async function embedFontFaces(families: string[]): Promise<string> {
  const wanted = new Set(families.map((f) => f.toLowerCase()));
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // hoja cross-origin: no accesible, la salteamos.
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style
        .getPropertyValue("font-family")
        .replace(/['"]/g, "")
        .trim()
        .toLowerCase();
      if (!wanted.has(family)) continue;
      const src = rule.style.getPropertyValue("src");
      const m = src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
      if (!m) continue;
      try {
        const url = new URL(m[1], sheet.href ?? document.baseURI).href;
        const buf = await (await fetch(url)).arrayBuffer();
        const dataUri = `data:font/woff2;base64,${arrayBufferToBase64(buf)}`;
        out.push(
          rule.cssText.replace(/url\(\s*["']?[^"')]+["']?\s*\)/, `url(${dataUri})`),
        );
      } catch {
        // Si una fuente no se pudo embeber, seguimos con las demás (el stack
        // de fallback del sistema cubre el hueco).
      }
    }
  }
  return out.join("\n");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000; // evita "Maximum call stack" en archivos grandes.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Capítulos en el mismo orden que la sidebar: primero los de la raíz por
 * posición, después cada carpeta por posición con sus capítulos también por
 * posición.
 */
function orderChapters(book: Book): { id: string; title: string }[] {
  const inGroup = (folderId: string | null): Chapter[] =>
    book.chapters
      .filter((c) => (c.folderId ?? null) === folderId)
      .sort((a, b) => a.position - b.position);
  const out: { id: string; title: string }[] = [];
  for (const c of inGroup(null)) out.push({ id: c.id, title: c.title });
  for (const f of [...book.folders].sort((a, b) => a.position - b.position)) {
    for (const c of inGroup(f.id)) out.push({ id: c.id, title: c.title });
  }
  return out;
}

/**
 * Genera el PDF del libro (via diálogo de impresión del browser).
 * Asume que el contenido en disco ya está al día — el llamador debe haber
 * hecho `store.flushSave()` antes para no perder cambios pendientes.
 */
export async function exportBookToPdf(book: Book, typography: Typography): Promise<void> {
  const order = orderChapters(book);
  if (order.length === 0) return;
  const loaded: LoadedChapter[] = await Promise.all(
    order.map(async (c) => ({
      title: c.title,
      content: await readChapter(book.id, c.id),
    })),
  );
  const nonEmpty = loaded.filter((ch) => ch.content.trim() !== "");
  if (nonEmpty.length === 0) return;
  // Embebemos serif (Lora, cuerpo) + sans (Nunito, tapa/encabezados). Si el
  // cuerpo es sans, igual usa Nunito embebida.
  const fontFaces = await embedFontFaces(["Lora", "Nunito"]);
  const html = buildHtml(book, nonEmpty, typography, fontFaces);
  await printInIframe(html);
}

function buildHtml(
  book: Book,
  chapters: LoadedChapter[],
  typography: Typography,
  fontFaces: string,
): string {
  // IGNORAMOS los `\f` del editor. El editor los inserta cuando su textarea
  // desborda (722px con blank-lines de 25.5px); el prose del PDF es mucho
  // más eficiente (12px de margin entre `<p>`), así que respetar esos cortes
  // dejaba páginas semi-vacías. Paginamos el capítulo entero de corrido por
  // altura real del prose. Como el editor inserta `\f` justo después de un
  // whitespace, removerlos no merge palabras.
  const chaptersData = chapters.map((ch) => ({
    title: ch.title,
    html: markdownToHtml(ch.content),
  }));

  // El source vive oculto en el iframe para que el script pueda clonar de él.
  // Lo limpiamos antes de imprimir.
  const sourceHtml = chaptersData
    .map(
      (ch) =>
        `<div class="ch" data-title="${escapeHtml(ch.title)}">${ch.html}</div>`,
    )
    .join("");

  const title =
    escapeHtml(book.title) +
    (book.author ? " — " + escapeHtml(book.author) : "");

  // Cuerpo según la tipografía elegida en el editor; el resto (tapa, encabezado
  // de capítulo) queda en sans para contraste.
  const bodyFont = typography.family === "sans" ? SANS_STACK : SERIF_STACK;
  const bodySize = `${typography.size}px`;
  const bodyLineHeight = String(typography.lineHeight);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  /* Fuentes embebidas (data-URI): el PDF no depende de ningún CDN. */
${fontFaces}
  @page { size: 540px 810px; margin: 0; }
  @media print {
    html, body { margin: 0; padding: 0; background: white; }
    #source { display: none !important; }
  }
  html, body {
    margin: 0;
    padding: 0;
    background: white;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 540px;
    height: 810px;
    padding: 56px 60px 56px;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    background: white;
  }
  .page:last-child { page-break-after: auto; }

  .cover { display: flex; align-items: center; justify-content: center; }
  .cover-stack { text-align: center; max-width: 80%; }
  .cover-title {
    font-family: 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 36px;
    font-weight: 800;
    line-height: 1.2;
    color: #1a1a1a;
    margin: 0 0 24px;
  }
  .cover-author {
    font-family: 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 16px;
    font-style: italic;
    color: #666;
  }
  .cover .page-number { display: none; }

  .chapter-header {
    position: absolute;
    top: 22px;
    left: 60px;
    right: 60px;
    font-family: 'Nunito', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 11px;
    font-weight: 700;
    color: #999;
    text-align: center;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }

  .prose {
    font-family: ${bodyFont};
    font-size: ${bodySize};
    line-height: ${bodyLineHeight};
    color: #1a1a1a;
    word-break: normal;
    overflow-wrap: break-word;
  }
  .prose p { margin: 0 0 12px; }
  .prose h1 { font-size: 22px; margin: 18px 0 6px; font-weight: 700; }
  .prose h2 { font-size: 17px; margin: 18px 0 6px; font-weight: 700; }
  .prose h3 { font-size: 15px; margin: 18px 0 6px; font-weight: 600; }
  .prose ul { margin: 0 0 12px; padding-left: 22px; }
  .prose li { margin: 2px 0; }
  .prose blockquote {
    margin: 0 0 12px;
    padding-left: 12px;
    border-left: 2px solid #ccc;
    color: #555;
  }
  .prose strong { font-weight: 700; }
  .prose em { font-style: italic; }
  .prose img { max-width: 100%; height: auto; display: block; margin: 8px 0; }

  .page-number {
    position: absolute;
    bottom: 22px;
    left: 0;
    right: 0;
    text-align: center;
    font-family: ui-monospace, Consolas, "Courier New", monospace;
    font-size: 10px;
    color: #999;
  }

  /* Source oculto del que el script clona elementos. Misma anchura que .prose
   * para que el layout interno (line-wrapping) sea igual a la fuente. */
  #source {
    position: absolute;
    left: -99999px;
    top: 0;
    width: 420px;
    visibility: hidden;
    font-family: ${bodyFont};
    font-size: ${bodySize};
    line-height: ${bodyLineHeight};
  }
</style>
</head>
<body>
<div id="pages"></div>
<div id="source" aria-hidden="true">${sourceHtml}</div>
<script>
${getPaginationScript(book)}
</script>
</body>
</html>`;
}

/**
 * Script que corre dentro del iframe. Mide elemento a elemento contra
 * `PROSE_MAX_HEIGHT` y arma las páginas. Como mide en el iframe — mismo
 * contexto que el render — los cortes son exactos.
 */
function getPaginationScript(book: Book): string {
  const coverTitle = JSON.stringify(book.title);
  const coverAuthor = JSON.stringify(book.author ?? "");
  return `
(function() {
  var PROSE_MAX = ${PROSE_MAX_HEIGHT};
  var pagesContainer = document.getElementById('pages');
  var source = document.getElementById('source');

  function makeCover() {
    var page = document.createElement('section');
    page.className = 'page cover';
    var stack = document.createElement('div');
    stack.className = 'cover-stack';
    var t = document.createElement('div');
    t.className = 'cover-title';
    t.textContent = ${coverTitle};
    stack.appendChild(t);
    var authorStr = ${coverAuthor};
    if (authorStr) {
      var a = document.createElement('div');
      a.className = 'cover-author';
      a.textContent = authorStr;
      stack.appendChild(a);
    }
    page.appendChild(stack);
    return page;
  }

  function makeContentPage(chapterTitle, isFirstOfChapter, pageNum) {
    var page = document.createElement('section');
    page.className = 'page';
    if (isFirstOfChapter) {
      var header = document.createElement('div');
      header.className = 'chapter-header';
      header.textContent = chapterTitle;
      page.appendChild(header);
    }
    var prose = document.createElement('div');
    prose.className = 'prose';
    page.appendChild(prose);
    var num = document.createElement('div');
    num.className = 'page-number';
    num.textContent = pageNum;
    page.appendChild(num);
    return page;
  }

  function isPlainTextP(el) {
    if (el.tagName !== 'P') return false;
    for (var i = 0; i < el.childNodes.length; i++) {
      // 3 = TEXT_NODE; cualquier otra cosa (strong/em/etc) descalifica.
      if (el.childNodes[i].nodeType !== 3) return false;
    }
    return el.textContent.length > 0;
  }

  /**
   * Intenta partir un <p> de texto plano en dos: el prefijo mas largo que
   * entra en la pagina actual queda en el prose, el resto vuelve como nuevo
   * <p> para procesarse en la pagina siguiente. Devuelve el remainder o null
   * si no se pudo partir (mid-palabra extrema o sin word boundary).
   */
  function trySplitParagraph(el, prose) {
    if (!isPlainTextP(el)) return null;
    var text = el.textContent;
    var probe = el.cloneNode(false);
    probe.textContent = '';
    prose.appendChild(probe);
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      probe.textContent = text.substring(0, mid);
      if (prose.scrollHeight <= PROSE_MAX) lo = mid;
      else hi = mid - 1;
    }
    // Snap a word boundary si el cut cayo mid-palabra.
    var cut = lo;
    if (cut > 0 && cut < text.length) {
      var prev = text.charAt(cut - 1);
      var atCh = text.charAt(cut);
      var atBoundary = /\s/.test(prev) || /\s/.test(atCh);
      if (!atBoundary) {
        var minCut = Math.max(0, lo - 100);
        while (cut > minCut && !/\s/.test(text.charAt(cut - 1))) cut--;
        if (cut <= minCut && lo > 0) cut = lo;
      }
    }
    prose.removeChild(probe);
    if (cut <= 0 || cut >= text.length) return null;
    // Aplicar el split: primera parte queda, segunda vuelve al queue.
    var first = el.cloneNode(false);
    first.textContent = text.substring(0, cut);
    prose.appendChild(first);
    if (prose.scrollHeight > PROSE_MAX) {
      // Defensivo: si igual no entra, abortar el split.
      prose.removeChild(first);
      return null;
    }
    var second = el.cloneNode(false);
    second.textContent = text.substring(cut);
    return second;
  }

  function paginateChapter(chapterEl, counter) {
    var title = chapterEl.dataset.title;
    var queue = [];
    var children = chapterEl.children;
    for (var k = 0; k < children.length; k++) queue.push(children[k].cloneNode(true));
    if (queue.length === 0) return;

    var page = makeContentPage(title, true, ++counter.n);
    pagesContainer.appendChild(page);
    var prose = page.querySelector('.prose');

    var safety = 0;
    while (queue.length > 0 && safety++ < 10000) {
      var el = queue.shift();
      prose.appendChild(el);
      if (prose.scrollHeight <= PROSE_MAX) continue;

      // No entra. Remover y decidir: partir <p> o ir a nueva pagina.
      prose.removeChild(el);
      var remainder = trySplitParagraph(el, prose);
      if (remainder) {
        // Primera parte ya quedo en prose; el remainder va a la proxima pagina.
        queue.unshift(remainder);
      } else if (prose.children.length === 0) {
        // El elemento solo no entra ni en pagina vacia (parrafo monstruoso
        // con inline elements, o splitting fallido): lo dejamos, se clipea.
        prose.appendChild(el);
        continue;
      } else {
        // Imposible partir y la pagina ya tiene contenido: mandamos el
        // elemento entero a la proxima pagina.
        queue.unshift(el);
      }

      page = makeContentPage(title, false, ++counter.n);
      pagesContainer.appendChild(page);
      prose = page.querySelector('.prose');
    }
  }

  function run() {
    try {
      pagesContainer.appendChild(makeCover());
      var counter = { n: 0 };
      var chapters = source.querySelectorAll('.ch');
      for (var i = 0; i < chapters.length; i++) {
        paginateChapter(chapters[i], counter);
      }
      source.remove();
    } catch (e) {
      // Si la paginacion explota, igual intentamos imprimir lo que haya.
      console.error('q-books pagination error:', e);
    }
    // Esperar un tick para que el layout se asiente antes de print.
    setTimeout(function() {
      window.focus();
      window.print();
    }, 50);
  }

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(run, run);
  } else {
    run();
  }
})();
`;
}

/**
 * Imprime el HTML en un iframe oculto. La paginación y el `print()` los
 * dispara el script que viene embebido en el HTML — acá solo lo montamos y
 * esperamos `onafterprint` para limpiar.
 */
function printInIframe(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      setTimeout(() => {
        iframe.remove();
        resolve();
      }, 400);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.onafterprint = cleanup;
      // Fallback por si onafterprint no dispara (algunos WebViews).
      setTimeout(cleanup, 60_000);
    };

    const doc = iframe.contentDocument;
    if (!doc) {
      iframe.remove();
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
  });
}
