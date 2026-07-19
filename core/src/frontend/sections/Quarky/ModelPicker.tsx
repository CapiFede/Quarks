/**
 * Picker de modelo de OpenRouter. Carga el catálogo on-demand (cuando se abre la
 * sección de Quarky en Settings) y permite filtrar por nombre. Muestra contexto
 * en miles de tokens si está disponible.
 *
 * No vive en el header del panel: la decisión de modelo es algo de configuración
 * (cambia el comportamiento de TODAS las conversaciones), no algo a tocar a
 * mitad de un chat. Por eso es exclusivo de la pantalla de Settings.
 */
import { useEffect, useMemo, useState } from "react";
import { listModels } from "../../../quarky/provider";
import type { ModelInfo } from "../../../quarky/types";
import { report } from "../../../services/log";
import { Icon } from "../../components/Icon";
import { TextInput } from "../../components/TextInput";

export interface ModelPickerProps {
  value: string;
  onChange: (id: string) => void;
  /** Ids marcados como favoritos; aparecen primero y con estrella llena. */
  favorites: string[];
  /** Marca/desmarca el modelo como favorito. */
  onToggleFavorite: (id: string) => void;
}

export function ModelPicker({ value, onChange, favorites, onToggleFavorite }: ModelPickerProps) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listModels()
      .then((m) => {
        if (alive) setModels(m);
      })
      .catch((e) => {
        report("quarky.listModels", e);
        if (!alive) return;
        // El endpoint /models de OpenRouter es público (no requiere API key),
        // así que un fallo acá es de red / scope / firewall, no falta-de-key.
        const msg = e instanceof Error ? e.message : String(e);
        setError(`No se pudo cargar el catálogo: ${msg}`);
      });
    return () => {
      alive = false;
    };
  }, []);

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const filtered = useMemo(() => {
    if (!models) return [];
    const q = filter.trim().toLowerCase();
    const base = q
      ? models.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            (m.name ?? "").toLowerCase().includes(q),
        )
      : models;
    // Favoritos arriba; dentro de cada grupo el orden viene de `listModels()`
    // (alfabético por nombre). Estable por `sort()` desde ES2019.
    return [...base].sort((a, b) => {
      const af = favSet.has(a.id) ? 0 : 1;
      const bf = favSet.has(b.id) ? 0 : 1;
      return af - bf;
    });
  }, [models, filter, favSet]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <TextInput
        value={filter}
        onChange={setFilter}
        placeholder="Buscar modelo…"
        icon="search"
      />
      {error && (
        <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-error)" }}>{error}</div>
      )}
      <div
        style={{
          maxHeight: 280,
          overflow: "auto",
          border: "1px solid var(--q-border)",
          borderRadius: 6,
          background: "var(--q-surface-alt)",
        }}
      >
        {models === null && !error && (
          <Loading />
        )}
        {filtered.map((m) => (
          <Row
            key={m.id}
            model={m}
            selected={m.id === value}
            favorite={favSet.has(m.id)}
            onClick={() => onChange(m.id)}
            onToggleFavorite={() => onToggleFavorite(m.id)}
          />
        ))}
        {models !== null && filtered.length === 0 && !error && (
          <Empty />
        )}
      </div>
      <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-text-light)" }}>
        Modelo actual: <span className="q-mono">{value}</span>
      </div>
    </div>
  );
}

function Row({
  model,
  selected,
  favorite,
  onClick,
  onToggleFavorite,
}: {
  model: ModelInfo;
  selected: boolean;
  favorite: boolean;
  onClick: () => void;
  onToggleFavorite: () => void;
}) {
  const [hover, setHover] = useState(false);
  const ctx =
    model.contextLength !== undefined
      ? `${Math.round(model.contextLength / 1000)}k ctx`
      : null;
  const price = formatPricing(model.promptPrice, model.completionPrice);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        cursor: "default",
        borderBottom: "1px solid var(--q-border)",
        background: selected
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: selected ? "var(--q-primary-light)" : "var(--q-text-primary)",
      }}
    >
      <span
        onClick={(e) => {
          // Click en la estrella alterna favorito; no debe seleccionar el modelo.
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={favorite ? "Quitar de favoritos" : "Marcar como favorito"}
        style={{
          display: "inline-flex",
          padding: 2,
          flex: "0 0 auto",
          cursor: "default",
        }}
      >
        <Icon
          name="star"
          size={14}
          fill={favorite ? 1 : 0}
          color={favorite ? "#E5C97B" : "var(--q-text-light)"}
        />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--q-fs-12)",
            fontWeight: selected ? "var(--q-fw-semibold)" : "var(--q-fw-medium)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {model.name ?? model.id}
        </div>
        <div
          className="q-mono"
          style={{
            fontSize: "var(--q-fs-10)",
            color: "var(--q-text-light)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {model.id}
        </div>
      </div>
      {(ctx || price) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 1,
            flex: "0 0 auto",
          }}
          title={price ? "Precio por 1M tokens (entrada / salida)" : undefined}
        >
          {ctx && (
            <span style={{ fontSize: "var(--q-fs-10)", color: "var(--q-text-light)" }}>
              {ctx}
            </span>
          )}
          {price && (
            <span
              className="q-mono"
              style={{
                fontSize: "var(--q-fs-9)",
                color: "var(--q-text-light)",
                whiteSpace: "nowrap",
              }}
            >
              {price}
            </span>
          )}
        </div>
      )}
      {selected && <Icon name="check" size={14} />}
    </div>
  );
}

/**
 * Formatea el precio de OpenRouter para una fila del picker. La API devuelve
 * USD/token (p. ej. `"0.000003"`); multiplicamos por 1M para que el orden de
 * magnitud sea comprensible. Modelos sin pricing → null (no muestra nada).
 * Ambos a 0 → "gratis" (varios modelos open-source vienen así).
 */
function formatPricing(prompt?: number, completion?: number): string | null {
  if (prompt === undefined && completion === undefined) return null;
  const pin = (prompt ?? 0) * 1_000_000;
  const pout = (completion ?? 0) * 1_000_000;
  if (pin === 0 && pout === 0) return "gratis";
  return `$${money(pin)} / $${money(pout)} / 1M`;
}

/** Compacto: 3 → "3", 0.5 → "0.50", 0.005 → "0.005". Mantiene 2 sig figs. */
function money(n: number): string {
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 0.01) return n.toFixed(3).replace(/\.?0+$/, "");
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function Loading() {
  return (
    <div
      style={{
        padding: 16,
        textAlign: "center",
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-light)",
      }}
    >
      Cargando catálogo…
    </div>
  );
}

function Empty() {
  return (
    <div
      style={{
        padding: 16,
        textAlign: "center",
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-light)",
      }}
    >
      Sin resultados.
    </div>
  );
}
