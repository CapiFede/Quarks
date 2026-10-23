import { useMemo, useState } from "react";
import { Icon, IconButton, ConfirmDialog } from "@quarks/core";
import type { BooksStore } from "../store";
import type { CompareState } from "../types";
import { markdownToHtml } from "../util/markdown";
import { countWords } from "../util/metrics";

export interface ComparePaneProps {
  store: BooksStore;
  compare: CompareState;
}

/**
 * Panel derecho de la vista comparativa: read-only.
 *
 * Layout:
 *   ┌─ header (título + barra de acciones) ──────────────────────────┐
 *   ├─ body: card tipo libro (igual aspecto que el editor real, pero
 *   │  scrolleable internamente — no replicamos auto-paginación por
 *   │  overflow porque el contenido es solo lectura)
 *   └─ footer mini (cantidad de palabras del lado derecho)
 *
 * Acciones:
 *   - mode "user": un solo botón para cerrar el split.
 *   - mode "ai": tres botones (rechazar / reemplazar / aceptar como nuevo).
 */
export function ComparePane({ store, compare }: ComparePaneProps) {
  const html = useMemo(() => markdownToHtml(compare.content), [compare.content]);
  const words = useMemo(() => countWords(compare.content), [compare.content]);
  const [confirmReplace, setConfirmReplace] = useState(false);

  return (
    <div className="q-books-editor q-books-compare-pane">
      <div className="q-books-editor-header q-books-compare-header">
        <div className="q-books-compare-title-wrap">
          <Icon
            name={compare.mode === "ai" ? "auto_awesome" : "compare_arrows"}
            size={14}
            color="var(--q-text-secondary)"
          />
          <span className="q-books-chapter-heading q-books-compare-title">
            {compare.title}
          </span>
        </div>
        {compare.mode === "ai" ? (
          <div className="q-books-compare-actions">
            <button
              type="button"
              className="q-books-compare-btn q-books-compare-btn-reject"
              onClick={() => store.closeCompare()}
              title="Descartar la propuesta"
            >
              Rechazar
            </button>
            <button
              type="button"
              className="q-books-compare-btn q-books-compare-btn-replace"
              onClick={() => setConfirmReplace(true)}
              title="Pisar el capítulo actual con la propuesta"
            >
              Reemplazar
            </button>
            <button
              type="button"
              className="q-books-compare-btn q-books-compare-btn-accept"
              onClick={() => void store.acceptProposalAsNewChapter()}
              title="Crear un capítulo nuevo con la propuesta"
            >
              Aceptar
            </button>
          </div>
        ) : (
          <IconButton
            name="close"
            tooltip="Cerrar comparación"
            onClick={() => store.closeCompare()}
          />
        )}
      </div>

      {compare.mode === "ai" && compare.summary?.trim() && (
        <div className="q-books-compare-summary">
          <Icon name="info" size={12} color="var(--q-text-light)" />
          <span>{compare.summary}</span>
        </div>
      )}

      <div className="q-books-body q-books-compare-body">
        <div className="q-books-page-stack">
          <div className="q-books-page-card q-books-compare-card">
            <div
              className="q-books-prose q-books-preview q-books-compare-prose"
              // marked sanea/escapa el markdown del usuario / modelo.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      </div>

      <div className="q-books-editor-footer">
        <span className="q-books-footer-slot q-books-footer-left">
          {compare.mode === "ai" ? "propuesta IA" : "comparación"}
        </span>
        <span className="q-books-footer-slot q-books-footer-center">
          {/* Mantenemos la slot para alinear con el footer izquierdo. */}
        </span>
        <span className="q-books-footer-slot q-books-footer-right">
          {words} palabras
        </span>
      </div>

      {confirmReplace && (
        <ConfirmDialog
          title="Reemplazar capítulo"
          message="¿Reemplazar el capítulo actual con la propuesta? Se pierde el contenido original."
          confirmLabel="Reemplazar"
          destructive
          onConfirm={() => {
            setConfirmReplace(false);
            void store.replaceWithProposal();
          }}
          onCancel={() => setConfirmReplace(false)}
        />
      )}
    </div>
  );
}
