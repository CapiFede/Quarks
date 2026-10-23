/**
 * Tipos del quark Utils. Las preferencias (presets de timer, alarmas, último
 * rango del random) son globales. Ver `services/persistence.ts`.
 */

export type Tool = "clocks" | "random";

// ── Preferencias persistidas en disco ────────────────────────────────────────

export interface TimerPreset {
  id: string;
  label: string;
  ms: number;
}

export interface TimerPrefs {
  presets: TimerPreset[];
  lastDurationMs: number | null;
}

export type AlarmKind = "once" | "interval";

export interface Alarm {
  id: string;
  kind: AlarmKind;
  /** "HH:MM" — solo si kind === "once". */
  timeOfDay?: string;
  /** Cada N ms desde que se prendió — solo si kind === "interval". */
  intervalMs?: number;
  label: string;
  enabled: boolean;
  sound: boolean;
}

export interface AlarmPrefs {
  items: Alarm[];
}

export interface RandomPrefs {
  min: number;
  max: number;
}

export interface UtilsPreferences {
  activeTool: Tool;
  timer: TimerPrefs;
  alarms: AlarmPrefs;
  random: RandomPrefs;
}

// ── Estado runtime ───────────────────────────────────────────────────────────

export type TimerStatus = "idle" | "running" | "paused" | "done";

export interface TimerRuntime {
  status: TimerStatus;
  /** Duración total seteada en ms (lo que muestra el input). */
  durationMs: number;
  /** Ms restantes en el ciclo actual. */
  remainingMs: number;
}

export type StopwatchStatus = "idle" | "running" | "paused";

export interface StopwatchRuntime {
  status: StopwatchStatus;
  /** Ms transcurridos en total. */
  elapsedMs: number;
  /** Tiempos de cada lap (ms transcurridos al momento del lap). */
  laps: number[];
}

export interface AlarmRuntimeMap {
  /** Próxima ocurrencia (epoch ms) por id de alarma activa. */
  [alarmId: string]: number;
}

export interface AlarmFiring {
  alarmId: string;
  label: string;
  /** Epoch ms en que disparó. */
  firedAt: number;
}

export interface RandomRuntime {
  /** Último valor generado por "Generar", o null si todavía no se generó. */
  lastNumber: number | null;
  /** Último resultado del coin flip ("Cara" / "Cruz"), o null. */
  lastCoin: "Cara" | "Cruz" | null;
  /**
   * Contadores monotónicos que se incrementan en cada generación. La UI los usa
   * como React `key` para forzar remount del span del resultado y retriggerear
   * la animación de entrada — así dos resultados iguales seguidos también animan.
   */
  numberNonce: number;
  coinNonce: number;
}

export interface UtilsState {
  loaded: boolean;
  activeTool: Tool;
  timer: TimerRuntime;
  stopwatch: StopwatchRuntime;
  alarms: Alarm[];
  /** Próxima ocurrencia por id de alarma habilitada. */
  alarmNext: AlarmRuntimeMap;
  /** Alarma que está sonando ahora mismo (o null). Se renderea en el overlay. */
  firing: AlarmFiring | null;
  random: RandomRuntime;
  /** Editable desde el form del random. */
  randomMin: number;
  randomMax: number;
  /** Editable desde el form del timer (presets visibles). */
  timerPresets: TimerPreset[];
}
