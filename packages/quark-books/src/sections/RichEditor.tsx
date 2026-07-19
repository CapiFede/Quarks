import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { BooksStore } from "../store";
import type { SearchState } from "../types";
import { buildExtensions, BOOK_PAGE, SEARCH_RESULT_CLASS } from "./editorExtensions";
import type { PageBreak } from "./pageBreaksExtension";

/**
 * Editor WYSIWYG de capítulo sobre TipTap v3 (ProseMirror). Es una sola hoja de
 * papel CONTINUA (layout de bloque normal): selección, caret y click funcionan
 * como en cualquier editor. Las divisiones de página se dibujan como GUÍAS
 * visuales decorativas (líneas + "página N") sobre la hoja, calculadas a partir
 * del alto del contenido — NO se insertan en el documento, así no rompen nada.
 * El corte real de páginas lo hace el export a PDF.
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
  /** Firma de la tipografía: al cambiar, recomputamos las guías de página. */
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
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
  typographyKey,
  onEditorReady,
}: RichEditorProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /** Último markdown que EMITIMOS: distingue ediciones propias de cambios externos. */
  const lastEmittedRef = useRef<string>(" ");
  /** Índice del match activo ya scrolleado (para no re-scrollear en cada tecla). */
  const lastSearchIdxRef = useRef<number>(-1);
  /** Últimos cortes aplicados (para no re-despachar si no cambian). */
  const lastBreaksRef = useRef<PageBreak[]>([]);
  /** Total de páginas vigente (cortes + 1), para el contador del footer. */
  const totalPagesRef = useRef<number>(1);
  /** rAF que difiere el recálculo (evita el loop del ResizeObserver). */
  const relayoutRaf = useRef<number | null>(null);
  /** Firma alto×ancho del último cálculo: si no cambió, no recalculamos. */
  const lastSigRef = useRef<string>("");

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
      scheduleRecompute(editor);
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
  useEffect(() => {
    if (!editor) return;
    const ro = new ResizeObserver(() => scheduleRecompute(editor));
    ro.observe(editor.view.dom);
    scheduleRecompute(editor);
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

  function scheduleRecompute(ed: Editor): void {
    if (relayoutRaf.current !== null) cancelAnimationFrame(relayoutRaf.current);
    relayoutRaf.current = requestAnimationFrame(() => {
      relayoutRaf.current = null;
      recomputeBreaks(ed);
    });
  }

  /**
   * Decide dónde cae cada corte de página, A NIVEL DE LÍNEA (un párrafo se parte y
   * sigue en la página siguiente, como un libro real).
   *
   * Para medir con precisión sin que los separadores actuales contaminen las
   * coordenadas, los QUITAMOS (sincrónico, sin repintar), medimos las líneas en
   * limpio, y los volvemos a poner. Recorre las líneas visuales de cada bloque
   * acumulando alto; cuando una línea pasaría el alto de página, inserta el corte
   * JUSTO en el inicio de esa línea (su posición en el documento). El separador
   * rellena lo que sobra de la página + los márgenes, así su línea queda fija en
   * la grilla. El documento NO se toca: el párrafo sigue entero en el markdown.
   */
  function recomputeBreaks(ed: Editor): void {
    if (ed.isDestroyed) return;
    const view = ed.view;
    const dom = view.dom;

    // Si ni el alto ni el ancho cambiaron desde el último cálculo, no hay nada
    // que recalcular (evita trabajo y loops del ResizeObserver).
    const sig = `${dom.scrollHeight}x${dom.clientWidth}`;
    if (sig === lastSigRef.current) return;

    // Medir SIN separadores (sincrónico): coordenadas limpias e independientes de
    // dónde estaban los cortes → editar una página no descoloca las demás.
    ed.commands.setPageBreaks([]);

    const originY = dom.getBoundingClientRect().top;
    const contentH = BOOK_PAGE.contentHeight;
    const breaks: PageBreak[] = [];
    let pageStart = 0;
    let prevBottom = 0;
    let hasLine = false;

    view.state.doc.forEach((_node, offset) => {
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
              gapHeight: fill + 2 * BOOK_PAGE.marginY,
              lineOffset: fill + BOOK_PAGE.marginY,
            });
            pageStart = top;
          }
        }
        prevBottom = bottom;
        hasLine = true;
      }
    });

    totalPagesRef.current = breaks.length + 1;
    lastBreaksRef.current = breaks;
    ed.commands.setPageBreaks(breaks);
    lastSigRef.current = `${dom.scrollHeight}x${dom.clientWidth}`;
    reportPagination();
  }

  function reportPagination(): void {
    const total = totalPagesRef.current;
    const body = scrollerRef.current;
    // Alto en pantalla de una página = contenido + separador (2 márgenes).
    const stride = BOOK_PAGE.contentHeight + 2 * BOOK_PAGE.marginY;
    const current = body
      ? clamp(Math.floor(body.scrollTop / stride) + 1, 1, total)
      : 1;
    store.setPagination(current, total);
  }

  const onScroll = (): void => {
    const body = scrollerRef.current;
    if (!body) return;
    store.rememberScroll(body.scrollTop);
    reportPagination();
  };

  const paperStyle = {
    "--q-books-page-w": `${BOOK_PAGE.width}px`,
    "--q-books-page-mx": `${BOOK_PAGE.marginX}px`,
    "--q-books-page-my": `${BOOK_PAGE.marginY}px`,
    "--q-books-content-h": `${BOOK_PAGE.contentHeight}px`,
  } as CSSProperties;

  return (
    <div ref={scrollerRef} className="q-books-body" onScroll={onScroll}>
      <div className="q-books-page-stack">
        <div className="q-books-paper" style={paperStyle}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
