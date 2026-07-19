/**
 * Tipos del quark Consola.
 *
 * Una **Session** representa un PTY del backend Rust (gestionado por
 * `console_open`/`console_write`/`console_resize`/`console_close`). El runtime
 * de cada sesión (instancia xterm, contenedor DOM, listeners) vive en el store
 * (`SessionRuntime`), no se serializa.
 */

/** Estado serializable de una sesión — esto es lo que persiste por space. */
export interface ConsoleSession {
  /** UUID generado en el frontend; estable durante la vida del PTY. */
  id: string;
  /** Comando del shell efectivamente lanzado (`pwsh.exe`, `bash`, etc.). */
  shell: string;
  /** Argumentos del shell (`-NoLogo` para suprimir banner, etc.). */
  args: string[];
  /** Env extra a inyectar (`POWERSHELL_UPDATECHECK=Off`, etc.). */
  env: [string, string][];
  /**
   * Si la sesión fue solicitada como admin (UAC). Una sesión admin no se puede
   * convertir a normal y viceversa: hay que cerrar y crear otra.
   */
  elevated: boolean;
  /**
   * Working directory más reciente que el shell anunció vía OSC 7, o `null` si
   * el shell no emite OSC 7 (ej: PowerShell sin profile). Determina el nombre
   * del tab cuando no hay `name` custom.
   */
  cwd: string | null;
  /**
   * Nombre custom que puso el usuario (doble click → edit). Sobrescribe el
   * label derivado de cwd/shell. `null` = usar el label auto.
   */
  name: string | null;
  /** Exit code del shell si terminó; `null` mientras corre. */
  exitCode: number | null;
}

/** Espejo de la sección "console" del space en disco. */
export interface ConsoleSpaceSection {
  sessions: ConsoleSession[];
  activeSessionId: string | null;
}

/**
 * Shell ofrecido en el selector del "+". El backend (`console_list_shells`) los
 * arma con args/env razonables (p. ej. `-NoLogo` + `POWERSHELL_UPDATECHECK=Off`
 * para `pwsh.exe`); el frontend solo filtra por `available` y los muestra.
 */
export interface ShellOption {
  id: string;
  label: string;
  program: string;
  args: string[];
  env: [string, string][];
  available: boolean;
}

export interface ConsoleState {
  loaded: boolean;
  spaceId: string | null;
  sessions: ConsoleSession[];
  activeSessionId: string | null;
  /** Default shell que reporta el backend (para el botón "+ nueva sesión"). */
  defaultShell: string;
  /** Shells disponibles en el sistema, para el selector. */
  shells: ShellOption[];
}
