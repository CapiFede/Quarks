import { createContext, useContext, type ReactNode } from "react";
import { type Space, DEFAULT_SPACE } from "../../services/spaces";

/**
 * API que los quarks consumen para leer el Space activo (§5).
 *
 * Es el único uso de React Context en el core: el space activo es el valor
 * genuinamente transversal que todos los quarks necesitan, y los quarks se
 * construyen imperativamente vía `Quark.buildPage()`, donde prop-drilling no
 * aplica. El Shell envuelve el área de contenido con `<SpaceProvider>` y cada
 * quark llama a `useActiveSpace()`; al cambiar de space, los consumidores
 * re-renderizan (cambio de baja frecuencia, sin costo de performance).
 *
 * Reparto de data por space: el índice/estado liviano del quark va en la sección
 * `<quarkId>` del archivo del space (`spaces/<space.id>.json`, vía
 * `readSpaceSection`/`writeSpaceSection`); el contenido pesado en `packages/<quark>/…`.
 * Ver `.claude/knowledge/StorageLayout.md`.
 */
const SpaceContext = createContext<Space>(DEFAULT_SPACE);

export function SpaceProvider({
  space,
  children,
}: {
  space: Space;
  children: ReactNode;
}) {
  return <SpaceContext.Provider value={space}>{children}</SpaceContext.Provider>;
}

/** Devuelve el Space activo y re-renderiza al cambiar. Para uso de los quarks. */
export function useActiveSpace(): Space {
  return useContext(SpaceContext);
}
