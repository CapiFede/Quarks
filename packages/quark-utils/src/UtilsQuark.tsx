import type { AiContext, Quark } from "@quarks/core";
import { UtilsStore } from "./store";
import { UtilsPage } from "./sections/UtilsPage";

/**
 * Implementación del contrato `Quark` para Utilidades. Un único `UtilsStore`
 * mantiene el tick global (timer, cronómetro, alarmas) y vive en la instancia
 * del quark — sobrevive a los cambios de tab.
 */
export function createUtilsQuark(): Quark {
  const store = new UtilsStore();

  return {
    id: "utils",

    buildPage: () => <UtilsPage store={store} />,

    buildAiContext: () => buildUtilsAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}

/**
 * Snapshot del state de Utilidades para Quarky.
 * Es de utilidad limitada para la IA (no hay contenido que editar), pero le
 * decimos al menos en qué herramienta está parado el usuario y el estado del
 * timer/stopwatch — útil si el usuario pregunta "cuánto queda?".
 */
function buildUtilsAiContext(store: UtilsStore): AiContext | null {
  const s = store.getSnapshot();
  if (!s.loaded) return null;

  const lines = [
    `Estás en el quark Utilidades. Herramienta activa: ${s.activeTool}.`,
  ];

  if (s.activeTool === "clocks") {
    if (s.timer.status !== "idle") {
      lines.push(
        `Timer ${s.timer.status}: ${formatMs(s.timer.remainingMs)} / ${formatMs(s.timer.durationMs)}.`,
      );
    }
    if (s.stopwatch.status !== "idle") {
      lines.push(
        `Cronómetro ${s.stopwatch.status}: ${formatMs(s.stopwatch.elapsedMs)} (${s.stopwatch.laps.length} laps).`,
      );
    }
    const enabledAlarms = s.alarms.filter((a) => a.enabled);
    if (enabledAlarms.length > 0) {
      lines.push(`Alarmas activas: ${enabledAlarms.length}.`);
    }
  } else if (s.activeTool === "random") {
    lines.push(`Rango actual del random: [${s.randomMin}, ${s.randomMax}].`);
    if (s.random.lastNumber !== null) {
      lines.push(`Último número generado: ${s.random.lastNumber}.`);
    }
    if (s.random.lastCoin) lines.push(`Última moneda: ${s.random.lastCoin}.`);
  }

  return { instructions: lines.join("\n") };
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
