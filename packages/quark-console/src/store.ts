/**
 * Store del console quark. Mismo patrón que los otros: clase con estado +
 * acciones, expuesta a la página via `useSyncExternalStore`. La instancia vive
 * en el quark (`new ConsoleStore()`), sobrevive a cambios de tab del Shell.
 *
 * Persistencia: por space, en la sección "console" del archivo del space
 * (`spaces/<spaceId>.json`). Lo guardado es ÍNDICE de sesiones (id + shell +
 * cwd + elevated). El runtime (xterm Terminal + contenedor DOM + listeners)
 * vive acá en `runtimes`, no se serializa — al cerrar la app las sesiones
 * mueren, y al reabrir se re-spawnean fresh con el cwd recordado.
 *
 * Particionado por space: solo hay PTYs vivos del space ACTIVO. Cambiar de
 * space mata las sesiones del space saliente y restaura las del entrante.
 * Esto mantiene la lógica simple (recursos predecibles) y consistente con cómo
 * el resto de los quarks reaccionan al cambio de space.
 *
 * El xterm Terminal de cada sesión vive en su propio div detached: el
 * componente activo solo lo mueve al host visible (sin remontar). Así
 * preservamos scrollback y posición de cursor entre cambios de tab.
 */
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { UnlistenFn } from "@tauri-apps/api/event";

import * as bridge from "./services/bridge";
import { readConsoleSpace, writeConsoleSpace } from "./services/persistence";
import type { ConsoleSession, ConsoleState } from "./types";

const AUTOSAVE_MS = 400;

/** Recursos en-memoria por sesión. NO se serializan. */
interface SessionRuntime {
  id: string;
  terminal: Terminal;
  fit: FitAddon;
  /** Div detached: el componente lo mueve al host visible para mostrar el PTY. */
  container: HTMLDivElement;
  unlisten: UnlistenFn[];
}

const INITIAL: ConsoleState = {
  loaded: false,
  spaceId: null,
  sessions: [],
  activeSessionId: null,
  defaultShell: "powershell.exe",
  shells: [],
};

function newId(): string {
  return crypto.randomUUID();
}

export class ConsoleStore {
  private state: ConsoleState = INITIAL;
  private listeners = new Set<() => void>();
  private runtimes = new Map<string, SessionRuntime>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Suscripción (useSyncExternalStore) ──
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): ConsoleState => this.state;

  private set(patch: Partial<ConsoleState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    const [defaultShell, allShells] = await Promise.all([
      bridge.defaultShell(),
      bridge.listShells(),
    ]);
    const shells = allShells.filter((s) => s.available);
    this.set({ loaded: true, defaultShell, shells });
  }

  dispose(): void {
    this.flushSave();
    // No matamos las sesiones acá: el store puede ser reinstanciado por el
    // shell al reabrir el tab del quark, y queremos sobrevivir a eso. Las
    // sesiones se matan solo en `setSpace` (cambio de space) y al cerrar la app.
  }

  /**
   * Llamado por el quark cada vez que cambia el space activo. Dispone los
   * runtimes del space saliente, carga la persistencia del entrante y
   * re-spawnea PTYs para sus sesiones.
   */
  async setSpace(spaceId: string): Promise<void> {
    if (this.state.spaceId === spaceId) return;
    // 1. Tear down de las sesiones del space saliente.
    await this.tearDownAll();
    // 2. Cargar la persistencia del nuevo space.
    const section = await readConsoleSpace(spaceId);
    // 3. Re-spawn de cada sesión persistida. Si una falla, queda con exit code
    //    pero la dejamos en la lista para que el usuario pueda cerrarla.
    const restored: ConsoleSession[] = [];
    for (const s of section.sessions) {
      // Defaults para sesiones persistidas antes de soportar rename/args/env.
      const fresh: ConsoleSession = {
        ...s,
        name: s.name ?? null,
        args: s.args ?? [],
        env: s.env ?? [],
        exitCode: null,
      };
      try {
        await this.spawnPty(fresh);
        restored.push(fresh);
      } catch (e) {
        restored.push({
          ...fresh,
          exitCode: -1,
        });
        // Loguear y seguir; no abortamos toda la carga por una sesión rota.
        console.error("[console] no se pudo restaurar sesión", s.id, e);
      }
    }
    const activeId =
      section.activeSessionId && restored.some((x) => x.id === section.activeSessionId)
        ? section.activeSessionId
        : restored[0]?.id ?? null;
    this.set({ spaceId, sessions: restored, activeSessionId: activeId });
  }

  // ── Acciones públicas ──

  /**
   * Crea una sesión nueva en el space activo. `elevated: true` dispara UAC en
   * Windows; en otras plataformas devuelve error. Si se pasa un `ShellOption`
   * usamos su program/args/env; si no, caemos al default shell sin args ni env
   * extras (eso muestra el banner de pwsh, etc. — para evitarlo usar el
   * selector con `pwsh` que ya viene con `-NoLogo`).
   */
  async createSession(opts: {
    elevated?: boolean;
    shell?: import("./types").ShellOption;
  }): Promise<string> {
    if (!this.state.spaceId) {
      throw new Error("Space activo no inicializado");
    }
    const id = newId();
    const session: ConsoleSession = {
      id,
      shell: opts.shell?.program ?? this.state.defaultShell,
      args: opts.shell?.args ?? [],
      env: opts.shell?.env ?? [],
      elevated: !!opts.elevated,
      cwd: null,
      name: null,
      exitCode: null,
    };
    await this.spawnPty(session);
    // Insertar al final y activar.
    const sessions = [...this.state.sessions, session];
    this.set({ sessions, activeSessionId: id });
    this.schedulePrefsSave();
    return id;
  }

  selectSession(id: string): void {
    if (!this.state.sessions.some((s) => s.id === id)) return;
    if (this.state.activeSessionId === id) return;
    this.set({ activeSessionId: id });
    this.schedulePrefsSave();
    // El xterm de la sesión activa toma foco al montarse el host.
  }

  /**
   * Renombra la sesión. `name === ""` vuelve al label auto (cwd/shell).
   * No toca el PTY: es metadata pura de la UI.
   */
  renameSession(id: string, name: string): void {
    const trimmed = name.trim();
    const next = trimmed === "" ? null : trimmed;
    const sessions = this.state.sessions.map((s) =>
      s.id === id ? { ...s, name: next } : s,
    );
    this.set({ sessions });
    this.schedulePrefsSave();
  }

  async closeSession(id: string): Promise<void> {
    const idx = this.state.sessions.findIndex((s) => s.id === id);
    if (idx < 0) return;
    await this.tearDownOne(id);
    const sessions = this.state.sessions.filter((s) => s.id !== id);
    let activeSessionId = this.state.activeSessionId;
    if (activeSessionId === id) {
      // Activar la previa, si existe; si no, la siguiente; si no, ninguna.
      activeSessionId = sessions[idx - 1]?.id ?? sessions[idx]?.id ?? null;
    }
    this.set({ sessions, activeSessionId });
    this.schedulePrefsSave();
  }

  /** Mueve el container del xterm al host visible (sin remontar el terminal). */
  attachToHost(id: string, host: HTMLElement): () => void {
    const runtime = this.runtimes.get(id);
    if (!runtime) return () => {};
    host.appendChild(runtime.container);
    // Refit ante cualquier cambio de tamaño del host. Tras append, el host
    // ya tiene el tamaño real → fit() y resize del PTY.
    runtime.fit.fit();
    const { cols, rows } = runtime.terminal;
    void bridge.resize(id, cols, rows);
    runtime.terminal.focus();
    return () => {
      // Detach al desmontar: dejamos el container en limbo para reusarlo.
      if (runtime.container.parentElement === host) {
        host.removeChild(runtime.container);
      }
    };
  }

  /** Llamado por el componente cuando el host cambió de tamaño (ResizeObserver). */
  resizeActive(): void {
    const id = this.state.activeSessionId;
    if (!id) return;
    const runtime = this.runtimes.get(id);
    if (!runtime) return;
    runtime.fit.fit();
    const { cols, rows } = runtime.terminal;
    void bridge.resize(id, cols, rows);
  }

  // ── Internos ──

  private async spawnPty(session: ConsoleSession): Promise<void> {
    // Crear el Terminal + container fuera del DOM. El componente lo apenderá
    // cuando esta sesión sea la activa.
    const container = document.createElement("div");
    container.className = "q-console-terminal";
    const terminal = new Terminal({
      fontFamily:
        '"JetBrains Mono", "Cascadia Code", "Fira Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowProposedApi: true,
      theme: TERMINAL_THEME,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);

    // Tamaño inicial: usamos 80x24 hasta que el host real diga su tamaño.
    // El re-fit y el resize del PTY pasan en `attachToHost`.
    const cols = terminal.cols;
    const rows = terminal.rows;

    // Apertura del PTY backend ANTES de bindear los listeners (sino los
    // primeros bytes pueden perderse).
    const unlisten: UnlistenFn[] = [];
    unlisten.push(
      await bridge.onOutput(session.id, (bytes) => {
        // xterm acepta Uint8Array directamente (UTF-8 binary-safe).
        terminal.write(bytes);
      }),
    );
    unlisten.push(
      await bridge.onCwd(session.id, (cwd) => {
        this.updateSessionMeta(session.id, { cwd });
      }),
    );
    unlisten.push(
      await bridge.onExit(session.id, (code) => {
        this.updateSessionMeta(session.id, { exitCode: code });
        // Cursor visible pero no escribible: el terminal queda como historial.
        terminal.write(`\r\n\x1b[2m[proceso terminado con código ${code}]\x1b[0m\r\n`);
      }),
    );

    try {
      const res = await bridge.open({
        id: session.id,
        shell: session.shell,
        args: session.args,
        env: session.env,
        cwd: session.cwd ?? undefined,
        cols,
        rows,
        elevated: session.elevated,
      });
      // Backend puede ajustar el shell efectivo (ej: pwsh.exe si está en PATH).
      session.shell = res.shell;
    } catch (e) {
      // Si el open falla (UAC cancelado, helper no encontrado, etc.):
      // limpiamos listeners y propagamos.
      for (const u of unlisten) u();
      terminal.dispose();
      throw e;
    }

    // Input del usuario → PTY. Encode a UTF-8.
    const encoder = new TextEncoder();

    // Copy/paste estilo Windows Terminal:
    //   - Ctrl+C con selección  → copia y limpia selección (NO SIGINT).
    //   - Ctrl+C sin selección  → pasa al PTY (manda ^C → SIGINT).
    //   - Ctrl+V                → pega.
    //   - Ctrl+Shift+C/V        → copy/paste explícitos (nunca SIGINT).
    // attachCustomKeyEventHandler devuelve false para "yo lo manejé, no se lo
    // pases al PTY"; true para "seguí el flujo normal". OJO: `false` NO llama
    // a preventDefault — si no lo hacemos a mano, el browser dispara su paste
    // nativo sobre el textarea oculto de xterm y el listener interno mete el
    // texto otra vez → pegado doble.
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown" || !e.ctrlKey) return true;
      const key = e.key.toLowerCase();
      if (key === "c") {
        const sel = terminal.getSelection();
        if (sel) {
          void navigator.clipboard.writeText(sel);
          terminal.clearSelection();
          e.preventDefault();
          return false;
        }
        // Shift+C sin selección: el usuario quiso copy explícito → no propagar.
        if (e.shiftKey) {
          e.preventDefault();
          return false;
        }
        return true;
      }
      if (key === "v") {
        void navigator.clipboard.readText().then((text) => {
          if (text) void bridge.write(session.id, encoder.encode(text));
        });
        e.preventDefault();
        return false;
      }
      return true;
    });

    terminal.onData((data) => {
      void bridge.write(session.id, encoder.encode(data));
    });
    // Resize manual del terminal (ej: cambio de fuente) también propaga.
    terminal.onResize(({ cols, rows }) => {
      void bridge.resize(session.id, cols, rows);
    });

    this.runtimes.set(session.id, { id: session.id, terminal, fit, container, unlisten });
  }

  private async tearDownOne(id: string): Promise<void> {
    const r = this.runtimes.get(id);
    if (r) {
      for (const u of r.unlisten) u();
      r.terminal.dispose();
      r.container.remove();
      this.runtimes.delete(id);
    }
    try {
      await bridge.close(id);
    } catch {
      // Si ya estaba cerrada (exit code recibido), close devuelve igual ok;
      // si el backend tuvo un error, tampoco bloqueamos el teardown.
    }
  }

  private async tearDownAll(): Promise<void> {
    const ids = Array.from(this.runtimes.keys());
    await Promise.all(ids.map((id) => this.tearDownOne(id)));
  }

  private updateSessionMeta(id: string, patch: Partial<ConsoleSession>): void {
    const sessions = this.state.sessions.map((s) =>
      s.id === id ? { ...s, ...patch } : s,
    );
    this.set({ sessions });
    this.schedulePrefsSave();
  }

  // ── Autosave ──

  private schedulePrefsSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.savePrefs();
    }, AUTOSAVE_MS);
  }

  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    void this.savePrefs();
  }

  private async savePrefs(): Promise<void> {
    if (!this.state.spaceId) return;
    // Solo persistimos sesiones VIVAS (exit code null). Las muertas no se
    // restauran (no tienen sentido sin proceso).
    const alive = this.state.sessions.filter((s) => s.exitCode === null);
    const activeId =
      this.state.activeSessionId && alive.some((s) => s.id === this.state.activeSessionId)
        ? this.state.activeSessionId
        : alive[0]?.id ?? null;
    await writeConsoleSpace(this.state.spaceId, alive, activeId);
  }
}

/** Tema de xterm — alineado con los tokens del core (oscuro slick). */
const TERMINAL_THEME = {
  background: "#0e1116",
  foreground: "#e6e8eb",
  cursor: "#e6e8eb",
  cursorAccent: "#0e1116",
  selectionBackground: "#3b414a",
  black: "#181c22",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#dcdfe4",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};
