/**
 * Store del quark Utils. Mismo molde que MusicStore / BooksStore: clase con
 * estado + acciones, compartida por la página vía `useSyncExternalStore`. Vive
 * en la instancia del quark y sobrevive a cambios de tab (los tickers siguen
 * corriendo aunque la página no esté montada).
 *
 * Persistencia: global (no por-space) en `packages/utils/preferences.json`.
 * Lo runtime (contadores en curso, próxima ocurrencia de alarmas) NO se persiste.
 *
 * Autosave: 400ms de debounce sobre las preferencias. Se hace flush en `dispose()`.
 */
import type {
  Alarm,
  AlarmRuntimeMap,
  RandomRuntime,
  TimerPreset,
  TimerRuntime,
  StopwatchRuntime,
  Tool,
  UtilsPreferences,
  UtilsState,
} from "./types";
import { requestOpenQuark } from "@quarks/core";
import { readPrefs, writePrefs } from "./services/persistence";
import { bringToFront } from "./services/windowFocus";
import notificationSoundUrl from "./assets/notification.wav";

const TICK_MS = 250;
const AUTOSAVE_MS = 400;

const INITIAL_TIMER: TimerRuntime = {
  status: "idle",
  durationMs: 0,
  remainingMs: 0,
};

const INITIAL_STOPWATCH: StopwatchRuntime = {
  status: "idle",
  elapsedMs: 0,
  laps: [],
};

const INITIAL_RANDOM: RandomRuntime = {
  lastNumber: null,
  lastCoin: null,
  numberNonce: 0,
  coinNonce: 0,
};

const INITIAL: UtilsState = {
  loaded: false,
  activeTool: "clocks",
  timer: INITIAL_TIMER,
  stopwatch: INITIAL_STOPWATCH,
  alarms: [],
  alarmNext: {},
  firing: null,
  random: INITIAL_RANDOM,
  randomMin: 1,
  randomMax: 100,
  timerPresets: [],
};

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Próxima ocurrencia (epoch ms) de una alarma `once` con `timeOfDay` "HH:MM"
 * relativa a `from`. Si la hora ya pasó hoy, devuelve mañana misma hora.
 */
function nextOnce(timeOfDay: string, from: number): number {
  const [hh, mm] = timeOfDay.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return from + 24 * 3600 * 1000;
  const d = new Date(from);
  d.setHours(hh, mm, 0, 0);
  let t = d.getTime();
  if (t <= from) t += 24 * 3600 * 1000;
  return t;
}

function nextInterval(intervalMs: number, from: number): number {
  return from + Math.max(1000, intervalMs);
}

/** Recompone `alarmNext` para todas las alarmas activas, con `now` como base. */
function recomputeAlarmNext(alarms: Alarm[], now: number): AlarmRuntimeMap {
  const map: AlarmRuntimeMap = {};
  for (const a of alarms) {
    if (!a.enabled) continue;
    if (a.kind === "once" && a.timeOfDay) {
      map[a.id] = nextOnce(a.timeOfDay, now);
    } else if (a.kind === "interval" && a.intervalMs && a.intervalMs > 0) {
      map[a.id] = nextInterval(a.intervalMs, now);
    }
  }
  return map;
}

export class UtilsStore {
  private state: UtilsState = INITIAL;
  private listeners = new Set<() => void>();

  // Runtime sin re-render.
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  /** Base monotónica para calcular delta entre ticks (no se ve afectada por DST). */
  private lastTickMs = 0;
  /** Timer del autosave debounced. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Beep de timer/alarma vía Web Audio (contexto + buffer decodificado, ambos
   * on-demand y cacheados).
   *
   * NO usamos `HTMLAudioElement`: en el build de Linux (WebKitGTK) el `<audio>`
   * streamea el asset por el protocolo custom de Tauri, que no responde
   * range-requests como espera GStreamer. La pipeline de media se cuelga y el
   * WebProcess crashea (la alarma "se traba a 1s y crashea"). En `tauri dev` no
   * pasa porque Vite sirve el wav por HTTP con soporte de range. Web Audio baja
   * el archivo entero con `fetch` (sin ranges) y lo decodifica en proceso.
   */
  private audioCtx: AudioContext | null = null;
  private beepBuffer: AudioBuffer | null = null;
  private beepLoading: Promise<void> | null = null;

  // ── Suscripción (useSyncExternalStore) ──
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
  getSnapshot = (): UtilsState => this.state;

  private set(patch: Partial<UtilsState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  // ── Ciclo de vida ──
  async init(): Promise<void> {
    const prefs = await readPrefs();
    const now = Date.now();
    this.set({
      loaded: true,
      // Migración: las versiones previas guardaban "timer"/"stopwatch"/"alarm"
      // como tools separadas (y existía "system") — todo lo que no sea "random"
      // cae a "clocks".
      activeTool: prefs.activeTool === "random" ? "random" : "clocks",
      alarms: prefs.alarms.items,
      alarmNext: recomputeAlarmNext(prefs.alarms.items, now),
      randomMin: prefs.random.min,
      randomMax: prefs.random.max,
      timerPresets: prefs.timer.presets,
      timer: {
        ...INITIAL_TIMER,
        durationMs: prefs.timer.lastDurationMs ?? 0,
        remainingMs: prefs.timer.lastDurationMs ?? 0,
      },
    });
    this.startTick();
    // Pre-decodificá el beep para que el primer disparo suene sin latencia.
    void this.ensureBeep().catch(() => {});
  }

  dispose(): void {
    this.stopTick();
    this.flushSave();
    void this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.beepBuffer = null;
    this.beepLoading = null;
  }

  // ── Tick global ──
  private startTick(): void {
    this.stopTick();
    this.lastTickMs = performance.now();
    this.tickTimer = setInterval(() => this.onTick(), TICK_MS);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private onTick(): void {
    const nowMono = performance.now();
    const delta = nowMono - this.lastTickMs;
    this.lastTickMs = nowMono;
    const wall = Date.now();

    let patch: Partial<UtilsState> = {};
    let timerEnded = false;
    let alarmSound: boolean | null = null;

    // Timer
    if (this.state.timer.status === "running") {
      const remainingMs = Math.max(0, this.state.timer.remainingMs - delta);
      if (remainingMs === 0) {
        patch.timer = { ...this.state.timer, status: "done", remainingMs: 0 };
        timerEnded = true;
      } else {
        patch.timer = { ...this.state.timer, remainingMs };
      }
    }

    // Stopwatch
    if (this.state.stopwatch.status === "running") {
      patch.stopwatch = {
        ...this.state.stopwatch,
        elapsedMs: this.state.stopwatch.elapsedMs + delta,
      };
    }

    // Alarmas (solo si ninguna está sonando actualmente)
    if (!this.state.firing) {
      for (const a of this.state.alarms) {
        if (!a.enabled) continue;
        const next = this.state.alarmNext[a.id];
        if (next && wall >= next) {
          patch.firing = { alarmId: a.id, label: a.label || "Alarma", firedAt: wall };
          alarmSound = a.sound;
          // Solo una alarma a la vez; si caen varias en el mismo tick, las próximas
          // se redisparan después del dismiss porque su `next` no se mueve.
          break;
        }
      }
    }

    // Confirmá el estado ANTES de cualquier efecto colateral. Antes el timer
    // disparaba sus efectos (enfocar tab + beep) en medio del tick, antes de
    // aplicar el patch `done`: si `requestOpenQuark` lanzaba, `this.set` quedaba
    // sin ejecutar, el timer seguía en "running" y volvía a llegar a 0 cada tick
    // — congelado en 00:01, re-disparando 4 veces por segundo hasta colgar la app.
    if (Object.keys(patch).length > 0) this.set(patch);

    // Efectos colaterales: ya con el estado committeado y fuera del stack del tick.
    if (timerEnded) this.presentFired(true);
    if (alarmSound !== null) this.presentFired(alarmSound);
  }

  // ── Navegación interna ──
  selectTool(tool: Tool): void {
    if (tool === this.state.activeTool) return;
    this.set({ activeTool: tool });
    this.schedulePrefsSave();
  }

  // ── Timer ──
  setTimerDuration(ms: number): void {
    const safe = Math.max(0, Math.floor(ms));
    this.set({
      timer: { status: "idle", durationMs: safe, remainingMs: safe },
    });
    this.schedulePrefsSave();
  }

  startTimer(): void {
    const t = this.state.timer;
    if (t.durationMs <= 0) return;
    // Si está done, reinicia desde duration.
    const remaining = t.status === "done" ? t.durationMs : t.remainingMs || t.durationMs;
    this.set({ timer: { ...t, status: "running", remainingMs: remaining } });
  }

  pauseTimer(): void {
    if (this.state.timer.status !== "running") return;
    this.set({ timer: { ...this.state.timer, status: "paused" } });
  }

  resumeTimer(): void {
    if (this.state.timer.status !== "paused") return;
    this.set({ timer: { ...this.state.timer, status: "running" } });
  }

  resetTimer(): void {
    const d = this.state.timer.durationMs;
    this.set({ timer: { status: "idle", durationMs: d, remainingMs: d } });
  }

  addTimerPreset(label: string, ms: number): void {
    const safeMs = Math.max(1000, Math.floor(ms));
    const preset: TimerPreset = { id: `p-${newId()}`, label, ms: safeMs };
    this.set({ timerPresets: [...this.state.timerPresets, preset] });
    this.schedulePrefsSave();
  }

  removeTimerPreset(id: string): void {
    this.set({
      timerPresets: this.state.timerPresets.filter((p) => p.id !== id),
    });
    this.schedulePrefsSave();
  }

  // ── Stopwatch ──
  startStopwatch(): void {
    if (this.state.stopwatch.status === "running") return;
    this.set({
      stopwatch: { ...this.state.stopwatch, status: "running" },
    });
  }

  pauseStopwatch(): void {
    if (this.state.stopwatch.status !== "running") return;
    this.set({ stopwatch: { ...this.state.stopwatch, status: "paused" } });
  }

  resetStopwatch(): void {
    this.set({ stopwatch: { ...INITIAL_STOPWATCH } });
  }

  lapStopwatch(): void {
    if (this.state.stopwatch.status === "idle") return;
    this.set({
      stopwatch: {
        ...this.state.stopwatch,
        laps: [...this.state.stopwatch.laps, this.state.stopwatch.elapsedMs],
      },
    });
  }

  // ── Alarmas ──
  addAlarm(input: Omit<Alarm, "id">): void {
    const alarm: Alarm = { ...input, id: `a-${newId()}` };
    const alarms = [...this.state.alarms, alarm];
    this.set({ alarms, alarmNext: recomputeAlarmNext(alarms, Date.now()) });
    this.schedulePrefsSave();
  }

  updateAlarm(id: string, patch: Partial<Omit<Alarm, "id">>): void {
    const alarms = this.state.alarms.map((a) => (a.id === id ? { ...a, ...patch } : a));
    this.set({ alarms, alarmNext: recomputeAlarmNext(alarms, Date.now()) });
    this.schedulePrefsSave();
  }

  toggleAlarm(id: string): void {
    const a = this.state.alarms.find((x) => x.id === id);
    if (!a) return;
    this.updateAlarm(id, { enabled: !a.enabled });
  }

  removeAlarm(id: string): void {
    const alarms = this.state.alarms.filter((a) => a.id !== id);
    this.set({ alarms, alarmNext: recomputeAlarmNext(alarms, Date.now()) });
    this.schedulePrefsSave();
  }

  /**
   * Saltea el próximo disparo de la alarma sin desactivarla. Para `once`,
   * empuja al día siguiente a la misma hora; para `interval`, suma un período.
   */
  skipNextAlarm(id: string): void {
    const alarm = this.state.alarms.find((a) => a.id === id);
    if (!alarm || !alarm.enabled) return;
    const cur = this.state.alarmNext[id];
    if (!cur) return;
    let next: number | undefined;
    if (alarm.kind === "once" && alarm.timeOfDay) {
      next = nextOnce(alarm.timeOfDay, cur + 1000);
    } else if (alarm.kind === "interval" && alarm.intervalMs) {
      next = cur + Math.max(1000, alarm.intervalMs);
    }
    if (next === undefined) return;
    this.set({ alarmNext: { ...this.state.alarmNext, [id]: next } });
  }

  /**
   * Reinicia una sola alarma: la re-habilita si estaba apagada (p. ej. una
   * `once` que se apagó sola al disparar) y recalcula su próxima ocurrencia
   * desde ahora. Para `interval` esto reinicia la cuenta regresiva; para `once`
   * la re-arma para la próxima vez a esa hora. No toca el resto de las alarmas.
   */
  restartAlarm(id: string): void {
    const alarm = this.state.alarms.find((a) => a.id === id);
    if (!alarm) return;
    const now = Date.now();
    const alarms = alarm.enabled
      ? this.state.alarms
      : this.state.alarms.map((a) => (a.id === id ? { ...a, enabled: true } : a));

    let next: number | undefined;
    if (alarm.kind === "once" && alarm.timeOfDay) {
      next = nextOnce(alarm.timeOfDay, now);
    } else if (alarm.kind === "interval" && alarm.intervalMs && alarm.intervalMs > 0) {
      next = nextInterval(alarm.intervalMs, now);
    }
    const alarmNext = { ...this.state.alarmNext };
    if (next !== undefined) alarmNext[id] = next;

    this.set({ alarms, alarmNext });
    this.schedulePrefsSave();
  }

  dismissFiring(): void {
    const fire = this.state.firing;
    if (!fire) return;
    const alarm = this.state.alarms.find((a) => a.id === fire.alarmId);
    let alarms = this.state.alarms;
    if (alarm && alarm.kind === "once") {
      // Las puntuales se apagan tras disparar (no queremos que vuelvan mañana automático).
      alarms = alarms.map((a) => (a.id === fire.alarmId ? { ...a, enabled: false } : a));
    }
    this.set({
      alarms,
      alarmNext: recomputeAlarmNext(alarms, Date.now()),
      firing: null,
    });
    this.schedulePrefsSave();
  }

  /**
   * Presenta un disparo (fin de timer o alarma): trae Utilidades al frente para
   * que el overlay / estado "done" sea visible aunque el usuario esté en otro
   * quark, y opcionalmente suena el beep.
   *
   * Se difiere con `queueMicrotask` y se traga todo error a propósito: el estado
   * ya quedó committeado por el caller, así que estos efectos no deben poder
   * abortar el tick ni re-renderizar de forma síncrona en medio de `onTick`.
   */
  private presentFired(playSound: boolean): void {
    queueMicrotask(() => {
      try {
        requestOpenQuark("utils");
      } catch {
        // El bus de navegación no debería fallar; si lo hace, no arrastramos el tick.
      }
      void bringToFront();
      if (playSound) this.playBeep();
    });
  }

  // ── Random / coin ──
  /**
   * Guarda min/max tal cual se tipearon (sin reordenar): si normalizáramos acá,
   * los inputs se pisarían mientras el usuario escribe. `generateRandom` es
   * quien ordena el rango al usarlo.
   */
  setRandomRange(min: number, max: number): void {
    this.set({ randomMin: min, randomMax: max });
    this.schedulePrefsSave();
  }

  generateRandom(): void {
    const { randomMin, randomMax } = this.state;
    const lo = Math.ceil(Math.min(randomMin, randomMax));
    const hi = Math.floor(Math.max(randomMin, randomMax));
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    this.set({
      random: {
        ...this.state.random,
        lastNumber: n,
        numberNonce: this.state.random.numberNonce + 1,
      },
    });
  }

  flipCoin(): void {
    const v = Math.random() < 0.5 ? "Cara" : "Cruz";
    this.set({
      random: {
        ...this.state.random,
        lastCoin: v,
        coinNonce: this.state.random.coinNonce + 1,
      },
    });
  }

  // ── Timer end ──
  acknowledgeTimer(): void {
    if (this.state.timer.status !== "done") return;
    this.resetTimer();
  }

  // ── Sonido ──
  private playBeep(): void {
    void this.ensureBeep()
      .then(() => {
        const ctx = this.audioCtx;
        const buf = this.beepBuffer;
        if (!ctx || !buf) return;
        // El contexto puede arrancar "suspended" hasta el primer gesto.
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      })
      .catch(() => {
        // Sin audio disponible: no-op.
      });
  }

  /** Crea el AudioContext y decodifica el wav una sola vez (cacheado). */
  private ensureBeep(): Promise<void> {
    if (this.beepBuffer) return Promise.resolve();
    if (this.beepLoading) return this.beepLoading;
    this.beepLoading = (async () => {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) throw new Error("AudioContext no disponible");
      const ctx = this.audioCtx ?? new Ctor();
      this.audioCtx = ctx;
      const res = await fetch(notificationSoundUrl);
      const bytes = await res.arrayBuffer();
      this.beepBuffer = await ctx.decodeAudioData(bytes);
    })();
    // Si falla, limpiá el latch para reintentar en el próximo disparo.
    void this.beepLoading.catch(() => {
      this.beepLoading = null;
    });
    return this.beepLoading;
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
    const next: UtilsPreferences = {
      activeTool: this.state.activeTool,
      timer: {
        presets: this.state.timerPresets,
        lastDurationMs: this.state.timer.durationMs || null,
      },
      alarms: { items: this.state.alarms },
      random: { min: this.state.randomMin, max: this.state.randomMax },
    };
    await writePrefs(next);
  }
}

