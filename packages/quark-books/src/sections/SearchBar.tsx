import { useState } from "react";
import { Button, IconButton, TextInput, Toggle } from "@quarks/core";
import type { BooksStore } from "../store";
import type { SearchState } from "../types";

export interface SearchBarProps {
  store: BooksStore;
  search: SearchState;
}

/**
 * Drawer de búsqueda y reemplazo bajo el header del editor. Slide vertical
 * 180ms easeOut. Cerrarlo con Escape (lo consume `Quark.onEscape()` del store).
 */
export function SearchBar({ store, search }: SearchBarProps) {
  const [replaceOpen, setReplaceOpen] = useState(false);

  return (
    <div
      style={{
        padding: "8px 12px",
        background: "var(--q-background)",
        borderBottom: "1px solid var(--q-border)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={search.query}
            onChange={(v) => store.setSearchQuery(v)}
            placeholder="Buscar en el capítulo…"
            icon="search"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) store.prevMatch();
                else store.nextMatch();
              }
            }}
          />
        </div>
        <span
          style={{
            fontFamily: "var(--q-font-mono)",
            fontSize: 11,
            color: "var(--q-text-light)",
            fontVariantNumeric: "tabular-nums",
            minWidth: 52,
            textAlign: "right",
          }}
        >
          {search.matchCount === 0
            ? "0 / 0"
            : `${search.matchIndex + 1} / ${search.matchCount}`}
        </span>
        <IconButton
          name="keyboard_arrow_up"
          tooltip="Anterior"
          onClick={() => store.prevMatch()}
        />
        <IconButton
          name="keyboard_arrow_down"
          tooltip="Siguiente"
          onClick={() => store.nextMatch()}
        />
        <IconButton
          name="swap_horiz"
          tooltip="Reemplazar"
          selected={replaceOpen}
          onClick={() => setReplaceOpen((o) => !o)}
        />
        <IconButton
          name="close"
          tooltip="Cerrar (Escape)"
          onClick={() => store.toggleSearch()}
        />
      </div>

      {replaceOpen && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              value={search.replace}
              onChange={(v) => store.setReplaceQuery(v)}
              placeholder="Reemplazar con…"
              icon="edit"
            />
          </div>
          <Button
            variant="outlined"
            onClick={() => store.replaceOne()}
            style={{ height: 28 }}
          >
            Uno
          </Button>
          <Button
            variant="outlined"
            onClick={() => store.replaceAllMatches()}
            style={{ height: 28 }}
          >
            Todos
          </Button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ToggleField
          checked={search.matchWord}
          onChange={(v) => store.setMatchWord(v)}
          label="Palabra completa"
        />
        <ToggleField
          checked={search.caseSensitive}
          onChange={(v) => store.setCaseSensitive(v)}
          label="Distingue mayúsculas"
        />
      </div>
    </div>
  );
}

function ToggleField({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <span
      onClick={() => onChange(!checked)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: "default",
        fontSize: 11,
        color: "var(--q-text-secondary)",
      }}
    >
      <Toggle checked={checked} onChange={onChange} />
      <span>{label}</span>
    </span>
  );
}
