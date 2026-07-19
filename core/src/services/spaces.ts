/**
 * Modelo y helpers de Spaces (concepto transversal del core, §5).
 *
 * Un Space es un modo/contexto global (Personal, Trabajo, Estudio…) que scopea
 * lo que cada quark muestra y crea. Las definiciones viven en `settings.json`
 * (se sincronizan), y el space activo en `appState.json` (device-local).
 *
 * El `id` es el slug del nombre (lowercase, espacios→guiones). Los nombres deben
 * ser únicos; renombrar un space cambia su id y por tanto sus rutas de data.
 *
 * Archivo puro (sin React). El estado vive en hooks; la API a quarks es
 * `useActiveSpace()` (ver `frontend/hooks/useActiveSpace.tsx`).
 */

export interface Space {
  /** Estable, generado al crear; segmento de las rutas de data. No cambia en rename. */
  id: string;
  /** Etiqueta visible, editable. */
  name: string;
  /** Color de acento (de `SPACE_COLORS`); señal visual del space activo. */
  color: string;
}

/**
 * Paleta fija de acentos. Tonos saturados-pero-suaves que conviven con las
 * superficies gris-cálido del tema oscuro. El primero (turquesa primary) es el
 * default. El picker de Settings elige de acá (evita un color-picker completo).
 */
export const SPACE_COLORS: string[] = [
  "#2A7E73", // turquesa (primary)
  "#3A6EA5", // azul
  "#8B6FB0", // violeta
  "#C36A86", // rosa
  "#C0883E", // ámbar
  "#5E9E6E", // verde
];

/** Space semilla: id FIJO (no random) para servir de fallback estable en defaults. */
export const DEFAULT_SPACE: Space = {
  id: "personal",
  name: "Personal",
  color: SPACE_COLORS[0],
};

/** Convierte el nombre en un slug usado como id y segmento de rutas. */
export function nameToId(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Crea un Space cuyo id es el slug del nombre. Los nombres deben ser únicos. */
export function makeSpace(name: string, color: string): Space {
  return { id: nameToId(name), name, color };
}

/** ¿Es una entrada de Space válida (forma mínima)? */
function isValidSpace(s: unknown): s is Space {
  return (
    typeof s === "object" &&
    s !== null &&
    typeof (s as Space).id === "string" &&
    typeof (s as Space).name === "string" &&
    typeof (s as Space).color === "string"
  );
}

/** Filtra entradas inválidas y garantiza ≥1 space (cae al default si queda vacío). */
export function normalizeSpaces(spaces: Space[] | undefined): Space[] {
  const valid = Array.isArray(spaces) ? spaces.filter(isValidSpace) : [];
  return valid.length > 0 ? valid : [DEFAULT_SPACE];
}

/** Resuelve el space activo contra la lista; cae al primero si el id no existe. */
export function resolveActive(spaces: Space[], activeId: string): Space {
  return spaces.find((s) => s.id === activeId) ?? spaces[0] ?? DEFAULT_SPACE;
}
