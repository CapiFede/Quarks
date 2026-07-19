import { useEffect, useRef, useState } from "react";
import { Icon, IconButton } from "@quarks/core";
import type { BooksStore } from "../store";
import { SIZE_MAX, SIZE_MIN } from "../store";
import type { BookFontFamily } from "../types";
import { useBooksState } from "../hooks/useBooksStore";

export interface TypographyMenuProps {
  store: BooksStore;
}

/** Presets de interlineado expuestos en la UI (el store acepta cualquier valor). */
const LINE_HEIGHT_PRESETS: { label: string; value: number }[] = [
  { label: "Compacto", value: 1.45 },
  { label: "Normal", value: 1.65 },
  { label: "Amplio", value: 1.9 },
];

/**
 * Control de tipografía de la página: familia (serif/sans), tamaño de cuerpo e
 * interlineado. Vive en la barra del editor; abre un popover con tres filas.
 * Los cambios se aplican en vivo (preferencia global, persistida en el store).
 */
export function TypographyMenu({ store }: TypographyMenuProps) {
  const { typography } = useBooksState(store);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <IconButton
        name="text_fields"
        tooltip="Tipografía"
        selected={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1000,
            width: 240,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            background: "var(--q-surface)",
            border: "1px solid var(--q-border-dark)",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.28)",
          }}
        >
          <Row label="Fuente">
            <Segmented<BookFontFamily>
              value={typography.family}
              options={[
                { label: "Serif", value: "serif" },
                { label: "Sans", value: "sans" },
              ]}
              onChange={(family) => store.setTypography({ family })}
            />
          </Row>

          <Row label="Tamaño">
            <Stepper
              value={typography.size}
              suffix="px"
              min={SIZE_MIN}
              max={SIZE_MAX}
              onChange={(size) => store.setTypography({ size })}
            />
          </Row>

          <Row label="Interlineado">
            <Segmented<number>
              value={closestPreset(typography.lineHeight)}
              options={LINE_HEIGHT_PRESETS.map((p) => ({ label: p.label, value: p.value }))}
              onChange={(lineHeight) => store.setTypography({ lineHeight })}
            />
          </Row>
        </div>
      )}
    </span>
  );
}

/** Mapea el interlineado actual al preset más cercano para resaltar el activo. */
function closestPreset(lineHeight: number): number {
  let best = LINE_HEIGHT_PRESETS[0].value;
  let bestDist = Infinity;
  for (const p of LINE_HEIGHT_PRESETS) {
    const d = Math.abs(p.value - lineHeight);
    if (d < bestDist) {
      bestDist = d;
      best = p.value;
    }
  }
  return best;
}

// ── Subcomponentes ──────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: "var(--q-text-light)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

interface SegmentedOption<T> {
  label: string;
  value: T;
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        padding: 2,
        background: "var(--q-background)",
        border: "1px solid var(--q-border)",
        borderRadius: 6,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1,
              appearance: "none",
              border: "none",
              borderRadius: 4,
              padding: "5px 0",
              cursor: "default",
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              fontFamily: "var(--q-font-sans)",
              color: active ? "var(--q-on-primary, #fff)" : "var(--q-text-secondary)",
              background: active ? "var(--q-primary)" : "transparent",
              transition: "background var(--q-dur-fast) var(--q-ease)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Stepper({
  value,
  suffix = "",
  min,
  max,
  onChange,
}: {
  value: number;
  suffix?: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: 2,
        background: "var(--q-background)",
        border: "1px solid var(--q-border)",
        borderRadius: 6,
      }}
    >
      <StepBtn icon="remove" disabled={value <= min} onClick={() => onChange(value - 1)} />
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--q-text-primary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
        {suffix}
      </span>
      <StepBtn icon="add" disabled={value >= max} onClick={() => onChange(value + 1)} />
    </div>
  );
}

function StepBtn({
  icon,
  disabled,
  onClick,
}: {
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        appearance: "none",
        border: "none",
        background: "transparent",
        borderRadius: 4,
        width: 28,
        height: 24,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
        color: "var(--q-text-secondary)",
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
