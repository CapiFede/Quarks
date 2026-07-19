import { useCallback, useMemo } from "react";
import type { SettingsController } from "./useSettings";
import type { Shell } from "./useShell";
import { type Space, makeSpace, nameToId, resolveActive } from "../../services/spaces";
import { existsJson, moveJson, writeJson } from "../../services/store";

export interface SpacesController {
  /** Spaces definidos (siempre ≥1). */
  spaces: Space[];
  /** Space activo, ya resuelto contra la lista (nunca queda colgando). */
  active: Space;
  /** Cambia el space activo. */
  setActive: (id: string) => void;
  /** Crea un space nuevo (id estable). */
  create: (name: string, color: string) => void;
  /** Edita nombre y/o color de un space. Si cambia el nombre, el id y los archivos se renombran también. */
  rename: (id: string, patch: { name?: string; color?: string }) => Promise<void>;
  /** Borra un space; bloquea si es el último. Si borra el activo, mueve el activo. */
  remove: (id: string) => void;
}

/**
 * Compone la definición de Spaces (en `settings.json`, sincronizable) con el
 * space activo (en `appState.json`, device-local, dueño: `useShell`).
 *
 * Centraliza la lógica cruzada: resolver el activo contra la lista y, al borrar
 * el activo, reasignarlo antes de quitarlo de la lista. Mantiene a `useShell`
 * como único escritor de `appState.json` y a `settings` como único de `settings.json`.
 */
export function useSpaces(settings: SettingsController, shell: Shell): SpacesController {
  const spaces = settings.settings.spaces;

  const active = useMemo(
    () => resolveActive(spaces, shell.activeSpace),
    [spaces, shell.activeSpace],
  );

  const setActive = shell.setActiveSpace;

  const create = useCallback(
    (name: string, color: string) => {
      const space = makeSpace(name, color);
      settings.update({ spaces: [...spaces, space] });
      // Crea el archivo del space enseguida (estructura visible aunque esté vacío).
      void existsJson(`spaces/${space.id}`).then((e) => {
        if (!e) void writeJson(`spaces/${space.id}`, {});
      });
    },
    [settings, spaces],
  );

  const rename = useCallback(
    async (id: string, patch: { name?: string; color?: string }) => {
      const newId = patch.name ? nameToId(patch.name) : id;
      if (newId !== id) {
        // Toda la data del space vive en un único archivo `spaces/<id>.json`; el
        // contenido en `packages/<quark>/…` se referencia por id propio (no por space),
        // así que renombrar el space es mover ese único archivo.
        await moveJson(`spaces/${id}`, `spaces/${newId}`);
        if (shell.activeSpace === id) shell.setActiveSpace(newId);
      }
      settings.update({
        spaces: spaces.map((s) =>
          s.id === id ? { ...s, ...patch, id: newId } : s,
        ),
      });
    },
    [settings, shell, spaces],
  );

  const remove = useCallback(
    (id: string) => {
      if (spaces.length <= 1) return; // siempre queda ≥1
      const next = spaces.filter((s) => s.id !== id);
      // Si borramos el activo, primero movemos el activo a otro que sí queda.
      if (shell.activeSpace === id) shell.setActiveSpace(next[0].id);
      settings.update({ spaces: next });
    },
    [settings, shell, spaces],
  );

  return { spaces, active, setActive, create, rename, remove };
}
