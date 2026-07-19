import { Icon, type AiContext, type Quark } from "@quarks/core";
import { ConsoleStore } from "./store";
import { ConsolePage } from "./sections/ConsolePage";
import { ConsoleToolbar } from "./sections/ConsoleToolbar";

/**
 * Implementación del contrato `Quark` para Consola. Un `ConsoleStore` único
 * mantiene las sesiones PTY y sus runtimes xterm; vive en la instancia del
 * quark y sobrevive a cambios de tab del Shell.
 */
export function createConsoleQuark(): Quark {
  const store = new ConsoleStore();

  return {
    id: "console",
    name: "Consola",
    icon: <Icon name="terminal" size={16} />,

    buildPage: () => <ConsolePage store={store} />,
    buildToolbar: () => <ConsoleToolbar store={store} />,

    buildAiContext: () => buildConsoleAiContext(store),

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}

/**
 * Snapshot del state de Consola para Quarky.
 * El buffer del PTY no se inyecta (vive en xterm, no en el store y puede ser
 * MB enteros). Solo el meta: sesiones, shell, cwd, cuál está activa.
 */
function buildConsoleAiContext(store: ConsoleStore): AiContext | null {
  const s = store.getSnapshot();
  if (!s.loaded) return null;
  if (s.sessions.length === 0) {
    return {
      instructions:
        "Estás en el quark Consola (terminales PTY). No hay sesiones abiertas.",
    };
  }
  const active = s.sessions.find((sess) => sess.id === s.activeSessionId) ?? null;
  const sessionList = s.sessions
    .map((sess) => {
      const marker = sess.id === s.activeSessionId ? " (activa)" : "";
      const label = sess.name ?? labelFromSession(sess.shell, sess.cwd);
      const state = sess.exitCode !== null ? ` [exit ${sess.exitCode}]` : "";
      return `- ${label}${marker}${state}`;
    })
    .join("\n");

  const lines = [
    "Estás en el quark Consola (terminales PTY).",
    active
      ? `Sesión activa: ${active.name ?? labelFromSession(active.shell, active.cwd)}` +
        ` (shell: ${active.shell}${active.cwd ? `, cwd: ${active.cwd}` : ""}${active.elevated ? ", elevada" : ""}).`
      : "No hay sesión activa.",
    "",
    "Sesiones abiertas:",
    sessionList,
  ];

  return { instructions: lines.join("\n") };
}

function labelFromSession(shell: string, cwd: string | null): string {
  if (cwd) {
    const parts = cwd.replace(/[/\\]+$/, "").split(/[/\\]/);
    const tail = parts[parts.length - 1] || cwd;
    return tail;
  }
  // Sin OSC 7 mostramos el nombre del shell pelado (sin extensión .exe).
  return shell.replace(/\.exe$/i, "");
}
