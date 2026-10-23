/**
 * Base de los stores de los quarks: estado inmutable + listeners, con la forma
 * que espera `useSyncExternalStore` (`subscribe` / `getSnapshot` estables).
 *
 * El snapshot es una referencia nueva en cada `set`, así React detecta el
 * cambio por identidad. Lo que no debe re-renderizar (timers, secuencias,
 * flags de carga) va en campos privados de la subclase, fuera del snapshot.
 */
export class ExternalStore<S> {
  protected state: S;
  private listeners = new Set<() => void>();

  constructor(initial: S) {
    this.state = initial;
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  getSnapshot = (): S => this.state;

  /** Mezcla `patch` en el estado y notifica. */
  protected set(patch: Partial<S>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
