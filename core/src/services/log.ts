/**
 * Manejo de errores en runtime del core.
 *
 * Filosofía: **un solo lugar emite a consola**. Los errores burbujean hasta
 * arriba (handlers globales + ErrorBoundary) o se entregan acá explícitamente
 * vía `report`; nunca se desparraman `console.*` por el código. Cada error se
 * etiqueta con el nombre de la funcionalidad donde se originó (`withScope`).
 *
 * Además de loguear, `report` notifica a suscriptores: así el popup de debug
 * (`ErrorOverlay`) ve exactamente los mismos errores que la consola, sin un
 * segundo camino que mantener.
 */

/** Marca para no loguear dos veces el mismo error (dos handlers, StrictMode). */
const LOGGED = Symbol("quarks.logged");

/** Error etiquetado con la funcionalidad donde se originó. */
export class ScopedError extends Error {
  readonly scope: string;

  constructor(scope: string, cause: unknown) {
    super(messageOf(cause), { cause });
    this.name = "ScopedError";
    this.scope = scope;
  }
}

/** Entrada que reciben los suscriptores (y que renderiza el popup). */
export interface ErrorEntry {
  scope?: string;
  message: string;
  stack?: string;
  time: number;
}

type Listener = (entry: ErrorEntry) => void;
const listeners = new Set<Listener>();

/**
 * SINK ÚNICO: el único `console.error` de toda la app. Idempotente. Desempaqueta
 * `ScopedError` para imprimir `[scope] mensaje`, conserva el error original (con
 * su stack real) y notifica a los suscriptores.
 */
export function report(error: unknown): void;
export function report(scope: string, error: unknown): void;
export function report(a: unknown, b?: unknown): void {
  const twoArgs = arguments.length >= 2;
  const error = twoArgs ? b : a;
  let scope = twoArgs ? String(a) : undefined;
  if (error instanceof ScopedError) scope = scope ?? error.scope;

  if (alreadyLogged(error)) return;

  const message = messageOf(error);
  const prefix = scope ? `[${scope}] ` : "";
  console.error(`${prefix}${message}`, error);

  const entry: ErrorEntry = { scope, message, stack: stackOf(error), time: Date.now() };
  for (const listener of listeners) {
    try {
      listener(entry);
    } catch {
      // Un suscriptor roto jamás debe impedir reportar el error.
    }
  }
}

/**
 * Suscribe un listener a cada error reportado; devuelve la función de baja.
 * Lo usa `ErrorOverlay` para alimentar el popup.
 */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Envuelve una funcionalidad: si lanza o rechaza, etiqueta el error con `scope`
 * y lo **re-lanza** para que burbujee al top (no loguea acá). Si ya es un
 * `ScopedError`, no lo re-envuelve: preserva el scope más interno (el más
 * específico). Soporta funciones síncronas y asíncronas.
 */
export function withScope<T>(scope: string, fn: () => Promise<T>): Promise<T>;
export function withScope<T>(scope: string, fn: () => T): T;
export function withScope<T>(scope: string, fn: () => T | Promise<T>): T | Promise<T> {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.catch((e: unknown) => {
        throw scoped(scope, e);
      });
    }
    return result;
  } catch (e) {
    throw scoped(scope, e);
  }
}

/**
 * Instala los handlers globales que atrapan todo lo que burbujee sin manejar.
 * Llamar UNA vez en `main.tsx`. Idempotente.
 */
let installed = false;
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    report(event.error ?? event.message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    report(event.reason);
    // Evita el "Uncaught (in promise)" duplicado que el navegador imprimiría.
    event.preventDefault();
  });
}

// ── Internos ─────────────────────────────────────────────────────────────────

function scoped(scope: string, error: unknown): ScopedError {
  return error instanceof ScopedError ? error : new ScopedError(scope, error);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function stackOf(error: unknown): string | undefined {
  if (error instanceof ScopedError && error.cause instanceof Error) return error.cause.stack;
  if (error instanceof Error) return error.stack;
  return undefined;
}

function alreadyLogged(error: unknown): boolean {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) {
    return false; // primitivos no se pueden marcar; se reportan igual.
  }
  const obj = error as Record<PropertyKey, unknown>;
  if (obj[LOGGED]) return true;
  obj[LOGGED] = true;
  return false;
}
