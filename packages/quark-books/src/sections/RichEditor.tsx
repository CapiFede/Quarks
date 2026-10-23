import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { BooksStore } from "../store";
import type { SearchState, TrimSize } from "../types";
import { buildExtensions, SEARCH_RESULT_CLASS } from "./editorExtensions";
import type { PageBreak } from "./pageBreaksExtension";
import { pageGeometry } from "../util/pageGeometry";
import { countWords, formatWords } from "../util/metrics";
import { clamp } from "@quarks/core";

/**
 * Editor WYSIWYG de capítulo sobre TipTap v3 (ProseMirror). Es una sola hoja de
 * papel CONTINUA (layout de bloque normal): selección, caret y click funcionan
 * como en cualquier editor. Las divisiones de página se dibujan como GUÍAS
 * visuales decorativas (líneas + "página N" + folio con las palabras de cada
 * página) sobre la hoja, calculadas a partir del alto del contenido — NO se
 * insertan en el documento, así no rompen nada. El corte real de páginas lo
 * hace el export a PDF.
 *
 * El markdown es la fuente de verdad en disco: lo serializa `@tiptap/markdown`
 * (`editor.getMarkdown()`) en cada cambio y lo parsea al cargar. El undo/redo es
 * el nativo de TipTap. La búsqueda corre con la extensión `search-and-replace`.
 *
 * El componente se monta con `key={chapterId}` desde `BookEditor`, así cada
 * capítulo arranca con un editor (e historial de undo) limpio.
 */
export interface RichEditorProps {
  store: BooksStore;
  /** Markdown del capítulo activo (fuente de verdad). */
  content: string;
  search: SearchState;
  /** Scroll persistido del capítulo, restaurado al montar. */
  chapterScrollTop: number;
  /** Formato físico de la hoja (define ancho, márgenes y alto de página). */
  trim: TrimSize;
  /** Firma de la tipografía + formato: al cambiar, recomputamos las guías. */
  typographyKey: string;
  /** Expone la instancia de TipTap al padre (toolbar, contador, búsqueda). */
  onEditorReady: (editor: Editor | null) => void;
}

/**
 * `editorProps` ESTABLE (identidad constante entre renders). `useEditor` compara
 * las opciones en cada render y, si difieren, reconfigura el editor entero
 * (`setOptions`). Como `RichEditor` re-renderiza al cambiar la selección, un
 * objeto nuevo acá reconfiguraría el editor a mitad de un drag y la selección
 * saltaría. Por eso `editorProps` y las extensiones se mantienen estables.
 */
const EDITOR_PROPS = {
  attributes: { class: "q-books-prose q-books-surface", spellcheck: "false" },
};

/** Escapa una cadena para usarla como regex literal. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface LineBox {
  top: number;
  bottom: number;
  left: number;
}

/**
 * Cajas de cada línea VISUAL de un bloque (viewport coords). Usa los rects de un
 * Range sobre el contenido y los agrupa por `top` (varios rects en la misma línea
 * —por negritas, etc.— se funden en una). Para un bloque vacío usa su caja.
 */
function lineBoxesOf(el: HTMLElement): LineBox[] {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0);
  if (rects.length === 0) {
    const r = el.getBoundingClientRect();
    return [{ top: r.top, bottom: r.bottom, left: r.left }];
  }
  const lines: LineBox[] = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.top - last.top) < 3) {
      last.bottom = Math.max(last.bottom, r.bottom);
      last.left = Math.min(last.left, r.left);
    } else {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left });
    }
  }
  return lines;
}

export function RichEditor({
  store,
  content,
  search,
  chapterScrollTop,
  trim,
  typographyKey,
  onEditorReady,
}: RichEditorProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const paperRef = useRef<HTMLDivElement | null>(null);
  /** Relleno al pie de la hoja que completa la última página (ver CSS). */
  const fillRef = useRef<HTMLDivElement | null>(null);
  /** Último markdown que EMITIMOS: distingue ediciones propias de cambios externos. */
  const lastEmittedRef = useRef<string>(" ");
  /** Índice del match activo ya scrolleado (para no re-scrollear en cada tecla). */
  const lastSearchIdxRef = useRef<number>(-1);
  /** Total de páginas vigente (cortes + 1), para el contador del footer. */
  const totalPagesRef = useRef<number>(1);
  /** rAF que difiere el recálculo (evita el loop del ResizeObserver). */
  const relayoutRaf = useRef<number | null>(null);
  /** Si el próximo recálculo es forzado (cambió el documento) o solo por resize. */
  const forceRecomputeRef = useRef<boolean>(false);
  /** Firma alto×ancho×página del último cálculo: si no cambió, no recalculamos. */
  const lastSigRef = useRef<string>("");
  /** Palabras de la última página de la hoja (su folio lo dibuja React). */
  const [lastPageWords, setLastPageWords] = useState<number | null>(null);

  // Geometría de la hoja en px (derivada del formato). En un ref para que los
  // callbacks (ResizeObserver, scroll, onUpdate) siempre lean la vigente.
  const page = useMemo(() => pageGeometry(trim), [trim]);
  const pageRef = useRef(page);
  pageRef.current = page;

  // Reflejar el estado de la búsqueda de la extensión en el store + scrollear al
  // match activo.
  function mirrorSearch(ed: Editor): void {
    if (ed.isDestroyed) return;
    const s = (ed.storage as unknown as Record<string, unknown>).searchAndReplace as
      | { results: unknown[]; resultIndex: number }
      | undefined;
    if (!s) return;
    const count = s.results.length;
    const index = count === 0 ? -1 : s.resultIndex;
    store.reportSearch(count, index);
    if (count > 0 && index !== lastSearchIdxRef.current) {
      lastSearchIdxRef.current = index;
      requestAnimationFrame(() => {
        const cur = ed.view.dom.querySelector(`.${SEARCH_RESULT_CLASS}-current`);
        cur?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  }

  // Extensiones e contenido inicial ESTABLES (ver nota en EDITOR_PROPS). Las
  // extensiones se construyen una vez; el contenido inicial se captura al montar
  // (el componente se remonta por capítulo vía `key`). Los cambios posteriores
  // entran por `setContent`, nunca reconfigurando opciones.
  const extensions = useMemo(() => buildExtensions(), []);
  const [initialContent] = useState(content);

  const editor = useEditor({
    extensions,
    content: initialContent,
    contentType: "markdown",
    editorProps: EDITOR_PROPS,
    onCreate: ({ editor }) => {
      lastEmittedRef.current = content;
      onEditorReady(editor);
      requestAnimationFrame(() => {
        const body = scrollerRef.current;
        if (body) body.scrollTop = chapterScrollTop;
      });
    },
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown();
      if (md === lastEmittedRef.current) return;
      lastEmittedRef.current = md;
      store.updateContent(md);
      // Cambió el documento: recalcular siempre (las palabras por página cambian
      // aunque el alto no).
      scheduleRecompute(editor, true);
    },
    onTransaction: ({ editor }) => {
      if (store.getSnapshot().search.open) mirrorSearch(editor);
    },
  });

  // Exponer/limpiar la instancia al padre (el remonte por capítulo la recrea).
  useEffect(() => {
    return () => onEditorReady(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalcular los cortes de página midiendo el alto real de cada bloque. El
  // ResizeObserver capta cualquier cambio que afecte el alto (tipeo, formato,
  // TIPOGRAFÍA, ancho). El recálculo se difiere con rAF para NO mutar el layout
  // dentro del callback del observer (eso dispara el error "ResizeObserver loop").
  // Un cambio de tipografía/formato fuerza el recálculo aunque el alto coincida.
  useEffect(() => {
    if (!editor) return;
    const ro = new ResizeObserver(() => scheduleRecompute(editor, false));
    ro.observe(editor.view.dom);
    scheduleRecompute(editor, true);
    return () => {
      ro.disconnect();
      if (relayoutRaf.current !== null) cancelAnimationFrame(relayoutRaf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, typographyKey]);

  // Sincronizar cambios EXTERNOS de contenido (propuesta IA). Los cambios de
  // capítulo NO pasan por acá (remontamos por `key`).
  useEffect(() => {
    if (!editor) return;
    if (content === lastEmittedRef.current) return;
    lastEmittedRef.current = content;
    editor.commands.setContent(content, { emitUpdate: false, contentType: "markdown" });
    scheduleRecompute(editor, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, content]);

  // Empujar query/flags a la extensión de búsqueda. El conteo y el resaltado
  // vuelven al store vía `onTransaction → mirrorSearch`.
  useEffect(() => {
    if (!editor) return;
    if (!search.open) {
      editor.commands.setSearchTerm("");
      lastSearchIdxRef.current = -1;
      return;
    }
    editor.commands.setCaseSensitive(search.caseSensitive);
    const esc = escapeRegExp(search.query);
    const term = search.query ? (search.matchWord ? `\\b${esc}\\b` : esc) : "";
    editor.commands.setSearchTerm(term);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, search.open, search.query, search.caseSensitive, search.matchWord]);

  // Operaciones de búsqueda que dispara la SearchBar (vía el store).
  useEffect(() => {
    if (!editor) return;
    store.attachSearchOps({
      next: () => editor.commands.nextSearchResult(),
      prev: () => editor.commands.previousSearchResult(),
      replaceCurrent: () => {
        editor.commands.setReplaceTerm(store.getSnapshot().search.replace);
        editor.commands.replace();
      },
      replaceAll: () => {
        editor.commands.setReplaceTerm(store.getSnapshot().search.replace);
        editor.commands.replaceAll();
      },
    });
    return () => store.detachSearchOps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, store]);

  function scheduleRecompute(ed: Editor, force: boolean): void {
    forceRecomputeRef.current = forceRecomputeRef.current || force;
    if (relayoutRaf.current !== null) cancelAnimationFrame(relayoutRaf.current);
    relayoutRaf.current = requestAnimationFrame(() => {
      relayoutRaf.current = null;
      const f = forceRecomputeRef.current;
      forceRecomputeRef.current = false;
      recomputeBreaks(ed, f);
    });
  }

  /**
   * Decide dónde cae cada corte de página, A NIVEL DE LÍNEA (un párrafo se parte y
   * sigue en la página siguiente, como un libro real), y cuenta las palabras de
   * cada página.
   *
   * Para medir con precisión sin que los separadores actuales contaminen las
   * coordenadas, los QUITAMOS (sincrónico, sin repintar), medimos las líneas en
   * limpio, y los volvemos a poner. Recorre las líneas visuales de cada bloque
   * acumulando alto; cuando una línea pasaría el alto de página, inserta el corte
   * JUSTO en el inicio de esa línea (su posición en el documento). El separador
   * rellena lo que sobra de la página + los márgenes, así su línea queda fija en
   * la grilla. El documento NO se toca: el párrafo sigue entero en el markdown.
   *
   * Las palabras de cada página salen del texto del documento entre corte y
   * corte. Al final se estira la hoja para que la última página mida lo mismo
   * que las demás.
   */
  function recomputeBreaks(ed: Editor, force: boolean): void {
    if (ed.isDestroyed) return;
    const view = ed.view;
    const dom = view.dom;
    const g = pageRef.current;

    // Sin cambios en el documento y con el mismo alto/ancho/página que el último
    // cálculo no hay nada que recalcular (evita trabajo y loops del ResizeObserver).
    const sigOf = () => `${dom.scrollHeight}x${dom.clientWidth}x${g.contentHeight}`;
    if (!force && sigOf() === lastSigRef.current) return;

    // Medir SIN separadores (sincrónico): coordenadas limpias e independientes de
    // dónde estaban los cortes → editar una página no descoloca las demás.
    ed.commands.setPageBreaks([]);

    const doc = view.state.doc;
    const originY = dom.getBoundingClientRect().top;
    const contentH = g.contentHeight;
    const breaks: PageBreak[] = [];
    let pageStart = 0;
    let pageStartPos = 0;
    let prevBottom = 0;
    let hasLine = false;

    const wordsBetween = (from: number, to: number): number =>
      countWords(doc.textBetween(from, Math.max(from, to), "\n", "\n"));

    doc.forEach((_node, offset) => {
      const blockDom = view.nodeDOM(offset);
      if (!(blockDom instanceof HTMLElement)) return;
      for (const line of lineBoxesOf(blockDom)) {
        const top = line.top - originY;
        const bottom = line.bottom - originY;
        if (!hasLine) pageStart = top;
        if (hasLine && bottom - pageStart > contentH) {
          const at = view.posAtCoords({
            left: line.left + 1,
            top: (line.top + line.bottom) / 2,
          });
          if (at) {
            const used = prevBottom - pageStart;
            const fill = Math.max(0, contentH - used);
            breaks.push({
              pos: at.pos,
              gapHeight: fill + 2 * g.marginY,
              lineOffset: fill + g.marginY,
              folioOffset: fill + g.marginY / 2,
              words: wordsBetween(pageStartPos, at.pos),
            });
            pageStart = top;
            pageStartPos = Math.max(pageStartPos, at.pos);
          }
        }
        prevBottom = bottom;
        hasLine = true;
      }
    });

    const total = breaks.length + 1;
    totalPagesRef.current = total;
    ed.commands.setPageBreaks(breaks);
    setLastPageWords(wordsBetween(pageStartPos, doc.content.size));

    // Completar la última página: la hoja mide páginas enteras.
    const fullHeight = total * contentH + (total - 1) * 2 * g.marginY;
    const fill = fillRef.current;
    if (fill) fill.style.height = `${Math.max(0, fullHeight - dom.offsetHeight)}px`;

    lastSigRef.current = sigOf();
    reportPagination();
  }

  /** Página que cae en el centro del viewport (1-based) + total, al footer. */
  function reportPagination(): void {
    const total = totalPagesRef.current;
    const body = scrollerRef.current;
    const paper = paperRef.current;
    if (!body || !paper) {
      store.setPagination(1, total);
      return;
    }
    const g = pageRef.current;
    // Alto en pantalla de una página = contenido + separador (2 márgenes).
    const stride = g.contentHeight + 2 * g.marginY;
    // Borde superior de la hoja, en coordenadas de scroll del body.
    const paperTop =
      paper.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    const center = body.scrollTop + body.clientHeight / 2 - paperTop;
    store.setPagination(clamp(Math.floor(center / stride) + 1, 1, total), total);
  }

  const onScroll = (): void => {
    const body = scrollerRef.current;
    if (!body) return;
    store.rememberScroll(body.scrollTop);
    reportPagination();
  };

  const paperStyle = {
    "--q-books-page-w": `${page.width}px`,
    "--q-books-page-mx": `${page.marginX}px`,
    "--q-books-page-my": `${page.marginY}px`,
    "--q-books-content-h": `${page.contentHeight}px`,
  } as CSSProperties;

  return (
    <div ref={scrollerRef} className="q-books-body" onScroll={onScroll}>
      <div className="q-books-page-stack">
        <div ref={paperRef} className="q-books-paper" style={paperStyle}>
          <EditorContent editor={editor} />
          <div ref={fillRef} className="q-books-paper-fill" />
          {lastPageWords !== null && (
            <div className="q-books-paper-folio">{formatWords(lastPageWords)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
