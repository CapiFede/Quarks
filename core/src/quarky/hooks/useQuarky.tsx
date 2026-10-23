/**
 * Estado y acciones globales de Quarky (provider + hook).
 *
 * Es el único Context del subsistema Quarky: el panel, el toolbar de la titlebar
 * y cualquier quark que quiera "abrir Quarky con esta pregunta" leen y disparan
 * acciones desde acá. Mantenemos el estado acá (en lugar de Stores externos como
 * los quarks) porque Quarky vive en un único árbol React (el Shell) y no
 * necesita atravesar sub-árboles desconectados.
 *
 * Persistencia: cada mutación que cambia disco (config, conversación) se
 * commitea via `quarky/store.ts` en la misma acción. No hay debounce: las
 * conversaciones son chicas y el store atómico ya tiene cola por archivo.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { report } from "../../services/log";
import { getSecret } from "../../services/secrets";
import type { AiContext } from "../../quark/types";
import {
  DEFAULT_CONFIG,
  type Conversation,
  type ConversationSummary,
  type Mode,
  type QuarkyConfig,
} from "../types";
import {
  deleteConversation as deleteConvFile,
  listConversations,
  readConfig,
  readConversation,
  readTabs,
  writeConfig,
  writeConversation,
  writeTabs,
} from "../store";
import {
  appendMessage,
  clearMessages as clearMessagesObj,
  makeUserMessage,
  newConversation,
  rename as renameConversationObj,
} from "../conversation";
import { OPENROUTER_KEY, QuarkyConfigError, getModelContextLength } from "../provider";
import { buildSystemPrompt } from "../systemPrompt";
import { runAgentLoop } from "../agentLoop";
import { generateTitle } from "../autoRename";
import { compactConversation, shouldCompact } from "../compactor";
import { extractAndStore } from "../memory/extractor";
import type { ApprovalDecision, ApprovalRequest } from "../tools/types";
import { UNTITLED } from "../../services/util";

export type Status = "idle" | "loading" | "sending" | "error";

export interface QuarkyContextValue {
  panelOpen: boolean;
  /** Estado del overlay "Contexto actual" sobre el panel (ver `ContextInspector`). */
  inspectorOpen: boolean;
  config: QuarkyConfig;
  conversations: ConversationSummary[];
  /** Ids de las conversaciones abiertas como tabs, en orden de la barra. */
  openTabIds: string[];
  active: Conversation | null;
  /** Id del quark activo en el shell (lo necesita el inspector y el system prompt). */
  activeQuarkId: string | null;
  status: Status;
  error: string | null;
  /** `null` mientras se chequea; `true`/`false` una vez resuelto. */
  apiKeyConfigured: boolean | null;

  open(): void;
  close(): void;
  toggle(): void;
  toggleInspector(): void;
  /** Re-chequea la presencia de la API key en el keyring (después de editar Settings). */
  refreshApiKey(): Promise<void>;
  /** Abre Settings en la sección Quarky. El Shell lo cablea al `openSettings` real. */
  openSettings(): void;
  /** Pasa `null` para deseleccionar la conversación actual. */
  selectConversation(id: string | null): Promise<void>;
  newConversation(): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  /** Cierra la tab (la saca de la barra) sin borrar la conversación del disco. */
  closeTab(id: string): Promise<void>;
  /** Vacía el histórico de la conversación conservando la tab (reusarla en blanco). */
  clearMessages(id: string): Promise<void>;
  renameConversation(id: string, title: string): Promise<void>;
  sendMessage(content: string, images?: string[]): Promise<void>;
  /** Frena el turno en curso: corta la request al modelo o la tool que esté corriendo. */
  stop(): void;
  setMode(mode: Mode): Promise<void>;
  setModel(model: string): Promise<void>;
  /** Activa/desactiva la inyección del contexto del quark (p. ej. capítulo abierto) en la conversación activa. */
  setAttachContext(enabled: boolean): Promise<void>;
  /** Activa/desactiva el retrieval semántico (RAG) sobre la memoria. */
  setRagEnabled(enabled: boolean): Promise<void>;
  /** Activa/desactiva la captura automática de memorias tras cada turno. */
  setAutoExtractMemory(enabled: boolean): Promise<void>;
  /** Cambia el modelo usado por el extractor/consolidador (idealmente cheap/free). */
  setExtractorModel(modelId: string): Promise<void>;
  /** Marca/desmarca el modelo como favorito. */
  toggleFavoriteModel(modelId: string): Promise<void>;
  /** Pedido de aprobación pendiente, o `null` si no hay nada esperando. */
  pendingApproval: ApprovalRequest | null;
  /** Responde al pedido pendiente con la decisión del usuario. */
  respondApproval(decision: ApprovalDecision): void;
  /** AiContext del quark activo (snapshot al momento de leerlo). */
  getAiContext(): AiContext | null;
}

const Context = createContext<QuarkyContextValue | null>(null);

export interface QuarkyProviderProps {
  /** Id del quark activo (tab abierto), o `null` si está en Home / Settings. */
  activeQuarkId: string | null;
  /**
   * Resolvedor del `AiContext` del quark activo. El Shell lo cablea con
   * `getQuarkInstance(id)?.buildAiContext?.()`. Lo dejamos como callback (no
   * importamos el registry acá adentro) para que `@quarks/core` no arrastre
   * todos los quarks en su grafo de imports — eso rompe los typechecks de
   * paquetes que solo usan tipos del core.
   */
  resolveAiContext?: (quarkId: string) => AiContext | null;
  /** Callback que abre la modal de Settings en la sección "quarky". */
  onOpenSettings: () => void;
  children: ReactNode;
}

export function QuarkyProvider({
  activeQuarkId,
  resolveAiContext,
  onOpenSettings,
  children,
}: QuarkyProviderProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [config, setConfig] = useState<QuarkyConfig>(DEFAULT_CONFIG);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  /** Resolver del request actual; lo dispara `respondApproval`. */
  const approvalResolverRef = useRef<((d: ApprovalDecision) => void) | null>(null);
  /** Controller del turno en curso; `stop()` lo aborta. */
  const abortRef = useRef<AbortController | null>(null);

  /** Ref a la conversación activa para que `sendMessage` no dependa de `active`. */
  const activeRef = useRef<Conversation | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  /** Ref a las tabs abiertas para que los callbacks no se recreen en cada cambio. */
  const openTabsRef = useRef<string[]>([]);
  useEffect(() => {
    openTabsRef.current = openTabIds;
  }, [openTabIds]);

  // Config en un ref: permite que `createNew` lea el modelo/mode default actuales
  // sin recrearse en cada cambio de config (mantiene su identity estable para
  // poder llamarlo desde efectos sin re-disparar la carga inicial).
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Ref a `createNew` (definido más abajo) para poder invocarlo desde el efecto
  // de carga inicial sin TDZ. Se asigna en cada render más abajo.
  const createNewRef = useRef<(() => Promise<void>) | null>(null);

  /** Persiste el estado de tabs (open + active). */
  const persistTabs = useCallback((openIds: string[], activeId: string | null) => {
    void writeTabs({ openIds, activeId }).catch((e) =>
      report("quarky.writeTabs", e),
    );
  }, []);

  // Cargar config al montar.
  useEffect(() => {
    let alive = true;
    void readConfig()
      .then((c) => alive && setConfig(c))
      .catch((e) => report("quarky.readConfig", e));
    return () => {
      alive = false;
    };
  }, []);

  /** Lee la presencia de la API key del keyring (no la key en sí). */
  const refreshApiKey = useCallback(async () => {
    try {
      const v = await getSecret(OPENROUTER_KEY);
      setApiKeyConfigured(!!v);
    } catch (e) {
      report("quarky.refreshApiKey", e);
      setApiKeyConfigured(false);
    }
  }, []);

  // Chequeo inicial al montar y cada vez que se abre el panel: cubre el caso
  // de que el usuario acabe de pegar la API key desde Settings.
  useEffect(() => {
    void refreshApiKey();
  }, [refreshApiKey, panelOpen]);

  // Cargar lista de conversaciones + restaurar tabs al montar.
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(null);
    void (async () => {
      try {
        const [list, tabs] = await Promise.all([listConversations(), readTabs()]);
        if (!alive) return;
        setConversations(list);
        // Solo conservamos tabs que sigan existiendo en disco (una conversación
        // borrada desde otra sesión no debe quedar como tab fantasma).
        const existing = new Set(list.map((c) => c.id));
        const openIds = tabs.openIds.filter((id) => existing.has(id));
        setOpenTabIds(openIds);
        openTabsRef.current = openIds;
        setStatus("idle");
        // Siempre al menos una tab: si no hay ninguna abierta, abrimos
        // una nueva en blanco. Así el toolbar (toggle de contexto, modelo) y la
        // barra de tabs siempre tienen una conversación donde operar.
        if (openIds.length === 0) {
          // `createNew` se define más abajo; lo llamamos vía ref para no caer en
          // la temporal dead zone al evaluar este efecto.
          if (alive) await createNewRef.current?.();
          return;
        }
        // Restaurar la conversación activa si su tab sigue abierta.
        const activeId =
          tabs.activeId && openIds.includes(tabs.activeId) ? tabs.activeId : null;
        if (activeId) {
          const conv = await readConversation(activeId);
          if (alive && conv) setActive(conv);
        }
        // Re-sincronizamos el archivo de tabs si quedó stale (filtramos fantasmas).
        if (
          openIds.length !== tabs.openIds.length ||
          activeId !== tabs.activeId
        ) {
          persistTabs(openIds, activeId);
        }
      } catch (e) {
        if (!alive) return;
        report("quarky.load", e);
        setStatus("error");
        setError("No se pudieron cargar las conversaciones.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [persistTabs]);

  // ── Acciones ───────────────────────────────────────────────────────────────

  const open = useCallback(() => setPanelOpen(true), []);
  const close = useCallback(() => setPanelOpen(false), []);
  const toggle = useCallback(() => setPanelOpen((v) => !v), []);
  const toggleInspector = useCallback(() => setInspectorOpen((v) => !v), []);

  // Cerrar el inspector si el panel se cierra: evita que quede abierto la
  // próxima vez que F4 abra el chat.
  useEffect(() => {
    if (!panelOpen) setInspectorOpen(false);
  }, [panelOpen]);

  const selectConversation = useCallback(
    async (id: string | null) => {
      if (id === null) {
        setActive(null);
        persistTabs(openTabsRef.current, null);
        return;
      }
      try {
        const conv = await readConversation(id);
        setActive(conv);
        // Seleccionar = abrir como tab si todavía no lo está (reabrir desde el
        // historial). Mantenemos el orden y solo agregamos al final.
        const nextOpen = openTabsRef.current.includes(id)
          ? openTabsRef.current
          : [...openTabsRef.current, id];
        if (nextOpen !== openTabsRef.current) setOpenTabIds(nextOpen);
        persistTabs(nextOpen, conv ? id : null);
      } catch (e) {
        report("quarky.selectConversation", e);
        setActive(null);
      }
    },
    [persistTabs],
  );

  const createNew = useCallback(async () => {
    // Hereda el último modelo usado (el de la conversación activa, si hay, o el
    // default de config). Lee de refs para mantener identity estable.
    const cfg = configRef.current;
    const model = activeRef.current?.model ?? cfg.model;
    const conv = newConversation(cfg.modeDefault, model);
    // Actualizamos refs de inmediato: si esto se llama desde un efecto (asegurar
    // ≥1 tab), los lectores síncronos siguientes ven el estado nuevo sin esperar
    // al re-render.
    activeRef.current = conv;
    const nextOpen = [...openTabsRef.current, conv.id];
    openTabsRef.current = nextOpen;
    setActive(conv);
    setOpenTabIds(nextOpen);
    // Persistimos el header vacío: así aparece en la lista aunque el usuario
    // no llegue a mandar el primer mensaje. Si esto resulta ruidoso, podemos
    // diferir la primera escritura al primer `sendMessage`.
    try {
      await writeConversation(conv);
      setConversations((prev) =>
        [{ id: conv.id, title: conv.title, updatedAt: conv.updatedAt }, ...prev],
      );
      persistTabs(nextOpen, conv.id);
    } catch (e) {
      report("quarky.newConversation", e);
    }
  }, [persistTabs]);
  // Mantener el ref apuntando a la última versión (la usa el efecto de carga).
  createNewRef.current = createNew;

  /**
   * Cierra una tab: la saca de la barra y, si era la activa, salta a la tab
   * vecina (o a ninguna). NO borra la conversación del disco — sigue reabrible
   * desde el historial.
   */
  const closeTab = useCallback(
    async (id: string) => {
      const prevOpen = openTabsRef.current;
      const idx = prevOpen.indexOf(id);
      const nextOpen = prevOpen.filter((t) => t !== id);
      setOpenTabIds(nextOpen);
      openTabsRef.current = nextOpen;

      // Siempre al menos una tab: si cerraste la última, abrimos una en blanco.
      if (nextOpen.length === 0) {
        await createNew();
        return;
      }

      let nextActiveId = activeRef.current?.id ?? null;
      if (activeRef.current?.id === id) {
        // Vecino: el de la derecha si existe, si no el de la izquierda.
        const neighbor = nextOpen[idx] ?? nextOpen[idx - 1] ?? null;
        nextActiveId = neighbor;
        if (neighbor) {
          try {
            setActive(await readConversation(neighbor));
          } catch (e) {
            report("quarky.closeTab.select", e);
            setActive(null);
            nextActiveId = null;
          }
        } else {
          setActive(null);
        }
      }
      persistTabs(nextOpen, nextActiveId);
    },
    [persistTabs, createNew],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      try {
        await deleteConvFile(id);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        // Borrar también la cierra como tab.
        if (openTabsRef.current.includes(id)) await closeTab(id);
        else if (activeRef.current?.id === id) setActive(null);
      } catch (e) {
        report("quarky.deleteConversation", e);
      }
    },
    [closeTab],
  );

  /**
   * Vacía el histórico de una conversación conservando la tab. Si es la activa,
   * actualiza la vista; si no, escribe a disco directamente.
   */
  const clearMessages = useCallback(
    async (id: string) => {
      try {
        const cur =
          activeRef.current?.id === id
            ? activeRef.current
            : await readConversation(id);
        if (!cur) return;
        const next = clearMessagesObj(cur);
        if (activeRef.current?.id === id) setActive(next);
        setConversations((prev) => {
          const head = { id: next.id, title: next.title, updatedAt: next.updatedAt };
          const rest = prev.filter((c) => c.id !== next.id);
          return [head, ...rest];
        });
        await writeConversation(next);
      } catch (e) {
        report("quarky.clearMessages", e);
      }
    },
    [],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const t = title.trim();
      if (!t) return;
      try {
        let conv: Conversation | null = null;
        if (activeRef.current?.id === id) conv = activeRef.current;
        else conv = await readConversation(id);
        if (!conv) return;
        const next = renameConversationObj(conv, t);
        // Persistencia + update inline (no usamos `persistConv` para no crear
        // dependencia hacia abajo en el archivo).
        setConversations((prev) => {
          const head = { id: next.id, title: next.title, updatedAt: next.updatedAt };
          const rest = prev.filter((c) => c.id !== next.id);
          return [head, ...rest];
        });
        if (activeRef.current?.id === next.id) setActive(next);
        await writeConversation(next);
      } catch (e) {
        report("quarky.renameConversation", e);
      }
    },
    [],
  );

  /**
   * Persiste a disco, sube `conv` al tope del list y, SI seguimos parados sobre
   * esa conversación, refresca el estado activo. Si el usuario cambió de chat
   * mid-flight, no le pisamos la vista — el escrito sigue, pero la UI no salta.
   */
  const persistConv = useCallback(async (conv: Conversation) => {
    setConversations((prev) => {
      const head = { id: conv.id, title: conv.title, updatedAt: conv.updatedAt };
      const rest = prev.filter((c) => c.id !== conv.id);
      return [head, ...rest];
    });
    if (activeRef.current?.id === conv.id || activeRef.current === null) {
      setActive(conv);
    }
    try {
      await writeConversation(conv);
    } catch (e) {
      report("quarky.writeConversation", e);
    }
  }, []);

  // Ref a activeQuarkId para que el closure de sendMessage no necesite
  // re-crearse cada vez que cambia el tab activo (las conversaciones siguen
  // su curso; el quark relevante es el que estaba abierto cuando preguntaste).
  const activeQuarkRef = useRef<string | null>(activeQuarkId);
  useEffect(() => {
    activeQuarkRef.current = activeQuarkId;
  }, [activeQuarkId]);

  const sendMessage = useCallback(
    async (content: string, images?: string[]) => {
      const text = content.trim();
      const imgs = images ?? [];
      if (!text && imgs.length === 0) return;

      // Auto-crea conversación si no había una activa (y la abre como tab).
      let base = activeRef.current;
      if (!base) {
        base = newConversation(config.modeDefault, config.model);
        const nextOpen = [...openTabsRef.current, base.id];
        setOpenTabIds(nextOpen);
        persistTabs(nextOpen, base.id);
      }
      const withUser = appendMessage(base, makeUserMessage(text, imgs));
      await persistConv(withUser);
      const activeQuarkId = activeQuarkRef.current;

      setStatus("sending");
      setError(null);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        // Snapshot del contexto que aporta el quark activo en este turno. Lo
        // llamamos UNA vez antes de empezar el loop: si dura varios hops, todos
        // ven el mismo estado del quark (cambios mid-loop se inyectan en el
        // próximo turno). Si `attachContext === false`, conservamos las
        // instructions (libro/capítulo/índice) pero NO inyectamos los attachments
        // (el texto completo del capítulo).
        const rawAiContext =
          activeQuarkId && resolveAiContext
            ? safeBuildAiContext(activeQuarkId, resolveAiContext)
            : null;
        const aiContext =
          rawAiContext && withUser.attachContext === false
            ? { ...rawAiContext, attachments: [] }
            : rawAiContext;
        const systemPrompt = await buildSystemPrompt({
          activeQuarkId,
          aiContext,
          userMessage: text,
          ragEnabled: config.ragEnabled,
          trackMemoryUses: true,
        });
        const workspaceRoot = config.workspaceRoot ?? "packages";
        const mode = withUser.mode;
        // Modelo de esta conversación; cae al default global si la conversación
        // es vieja y no lo tiene seteado.
        const model = withUser.model ?? config.model;

        const result = await runAgentLoop({
          systemPrompt,
          conversation: withUser,
          model,
          mode,
          maxHops: config.maxHops,
          workspaceRoot,
          signal: ctrl.signal,
          onUpdate: (conv) => {
            // Render incremental: persistimos en cada paso (assistant message,
            // tool result) para que el usuario vea progreso aunque el modelo
            // esté en medio del loop.
            void persistConv(conv);
          },
          requestApproval: (req) =>
            new Promise<ApprovalDecision>((resolve) => {
              approvalResolverRef.current = (decision) => {
                approvalResolverRef.current = null;
                setPendingApproval(null);
                resolve(decision);
              };
              setPendingApproval(req);
            }),
        });
        // El `onUpdate` ya persistió el último estado; nos aseguramos por las
        // dudas que la UI quede en sync (puede haber un race con la última
        // mutación si React no flushea inmediatamente).
        await persistConv(result.conversation);
        if (result.hitHopLimit) {
          // El loop paró por `maxHops` con un tool_result como último mensaje:
          // sin aviso, la UI quedaba muda y parecía que Quarky se colgó.
          setError(
            `Quarky se quedó sin pasos (${config.maxHops} hops). Mandá otro mensaje para que siga.`,
          );
          setStatus("error");
        } else {
          setStatus("idle");
        }

        /**
         * La versión más nueva de esta conversación: `activeRef` puede estar un
         * render atrás de `result.conversation` (o adelante, si el usuario ya
         * siguió). Para las tareas en background de abajo.
         */
        const latest = (): Conversation => {
          const cur = activeRef.current;
          return cur?.id === result.conversation.id && cur.updatedAt >= result.conversation.updatedAt
            ? cur
            : result.conversation;
        };
        /** ¿La conversación cambió desde `snapshot`? (otro turno, rename, clear…) */
        const changedSince = (snapshot: Conversation): boolean => {
          const cur = activeRef.current;
          return cur?.id === snapshot.id && cur.updatedAt > snapshot.updatedAt;
        };

        // Compactación automática: si superamos el 85% del context window del
        // modelo, resumimos los mensajes viejos. Background — el usuario ya
        // puede seguir escribiendo mientras compacta.
        void (async () => {
          const lastAssistant = [...result.conversation.messages]
            .reverse()
            .find((m) => m.role === "assistant" && m.usage);
          if (!lastAssistant?.usage) return;
          const ctxLen = await getModelContextLength(model);
          if (!shouldCompact(lastAssistant.usage, ctxLen)) return;
          const snapshot = latest();
          const { conversation: compacted, compacted: ok } = await compactConversation(
            snapshot,
            model,
          );
          if (!ok) return;
          // La llamada al LLM tarda segundos: si mientras tanto hubo otro
          // intercambio, no lo pisamos con el resumen del snapshot viejo. El
          // próximo turno vuelve a intentar.
          if (changedSince(snapshot)) return;
          await persistConv(compacted);
        })();

        // Auto-rename: si la conversación arrancó este turno (título por
        // default + primera asistencia con texto), generamos un título corto en
        // background. No await: el usuario ya puede seguir escribiendo.
        if (config.autoRename && result.conversation.title === UNTITLED) {
          const firstUser = result.conversation.messages.find((m) => m.role === "user");
          const firstAssistant = result.conversation.messages.find(
            (m) => m.role === "assistant" && m.content.trim().length > 0,
          );
          if (firstUser && firstAssistant) {
            void (async () => {
              const title = await generateTitle({
                model,
                userText: firstUser.content,
                assistantText: firstAssistant.content,
              });
              if (!title) return;
              const target = latest();
              // Si el usuario ya la renombró a mano mientras generábamos, gana él.
              if (target.title !== UNTITLED) return;
              await persistConv(renameConversationObj(target, title));
            })();
          }
        }

        // Auto-extracción de memoria: mira los últimos mensajes y, si encuentra
        // hechos durables del usuario, los guarda. Background: el usuario sigue
        // pudiendo tipear el siguiente mensaje sin esperar al extractor.
        if (config.autoExtractMemory && config.extractorModel) {
          void (async () => {
            try {
              await extractAndStore({
                messages: result.conversation.messages,
                extractorModel: config.extractorModel,
              });
            } catch (e) {
              report("quarky.autoExtract", e);
            }
          })();
        }
      } catch (e) {
        if (ctrl.signal.aborted) {
          // Lo frenó el usuario: no es un error. El loop ya cerró con stubs las
          // tool calls que quedaban y `onUpdate` persistió lo que alcanzó a haber.
          setStatus("idle");
          return;
        }
        const msg =
          e instanceof QuarkyConfigError || e instanceof Error
            ? e.message
            : "Falló la respuesta de Quarky.";
        report("quarky.sendMessage", e);
        setError(msg);
        setStatus("error");
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [
      config.model,
      config.modeDefault,
      config.maxHops,
      config.workspaceRoot,
      config.autoRename,
      config.ragEnabled,
      config.autoExtractMemory,
      config.extractorModel,
      persistConv,
      persistTabs,
    ],
  );

  const setMode = useCallback(
    async (mode: Mode) => {
      const cur = activeRef.current;
      if (!cur) return;
      const next = { ...cur, mode, updatedAt: Date.now() };
      await persistConv(next);
    },
    [persistConv],
  );

  /**
   * Parche de config: estado React + `config.json`. Las escrituras van en
   * cadena porque el ciclo leer → fusionar → escribir no es atómico y dos
   * parches solapados (p. ej. cambiar modelo y marcar un favorito) se pisarían
   * en disco. Actualiza `configRef` al instante para que un segundo parche en
   * el mismo tick vea el anterior.
   */
  const configChain = useRef<Promise<void>>(Promise.resolve());
  const patchConfig = useCallback((patch: Partial<QuarkyConfig>): Promise<void> => {
    setConfig((prev) => ({ ...prev, ...patch }));
    configRef.current = { ...configRef.current, ...patch };
    const next = configChain.current.then(async () => {
      const cur = await readConfig();
      await writeConfig({ ...cur, ...patch });
    });
    configChain.current = next.catch((e) => report("quarky.patchConfig", e));
    return configChain.current;
  }, []);

  /**
   * Cambia el modelo. Si hay conversación activa, lo escribe en ESA conversación
   * (por-chat). Además lo recuerda en `config.model` como default que heredan las
   * tabs nuevas.
   */
  const setModel = useCallback(
    async (model: string) => {
      const write = patchConfig({ model });
      const cur = activeRef.current;
      if (cur) {
        await persistConv({ ...cur, model, updatedAt: Date.now() });
      }
      await write;
    },
    [persistConv, patchConfig],
  );

  const setAttachContext = useCallback(
    async (enabled: boolean) => {
      const cur = activeRef.current;
      if (!cur) return;
      await persistConv({ ...cur, attachContext: enabled, updatedAt: Date.now() });
    },
    [persistConv],
  );

  const setRagEnabled = useCallback(
    (ragEnabled: boolean) => patchConfig({ ragEnabled }),
    [patchConfig],
  );

  const setAutoExtractMemory = useCallback(
    (autoExtractMemory: boolean) => patchConfig({ autoExtractMemory }),
    [patchConfig],
  );

  const setExtractorModel = useCallback(
    (extractorModel: string) => patchConfig({ extractorModel }),
    [patchConfig],
  );

  /**
   * Frena el turno en curso. Aborta la request/tool activa y, si el loop estaba
   * esperando una aprobación, la rechaza para destrabarlo: al volver, el loop ve
   * el signal abortado, cierra el resto con stubs y termina sin error.
   */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    approvalResolverRef.current?.({ kind: "reject", reason: "Cancelado por el usuario." });
  }, []);

  const respondApproval = useCallback((decision: ApprovalDecision) => {
    const resolver = approvalResolverRef.current;
    if (!resolver) return;
    resolver(decision);
  }, []);

  // Lee del ref y no del updater de `setConfig`: React difiere el updater si
  // hay un update pendiente, y calcular `next` adentro dejaba el favorito sin
  // persistir.
  const toggleFavoriteModel = useCallback(
    (modelId: string) => {
      const { favoriteModels } = configRef.current;
      const next = favoriteModels.includes(modelId)
        ? favoriteModels.filter((id) => id !== modelId)
        : [...favoriteModels, modelId];
      return patchConfig({ favoriteModels: next });
    },
    [patchConfig],
  );

  const value = useMemo<QuarkyContextValue>(
    () => ({
      panelOpen,
      inspectorOpen,
      config,
      conversations,
      openTabIds,
      active,
      activeQuarkId,
      status,
      error,
      apiKeyConfigured,
      open,
      close,
      toggle,
      toggleInspector,
      refreshApiKey,
      openSettings: onOpenSettings,
      selectConversation,
      newConversation: createNew,
      deleteConversation: removeConversation,
      closeTab,
      clearMessages,
      renameConversation,
      sendMessage,
      stop,
      setMode,
      setModel,
      setAttachContext,
      setRagEnabled,
      setAutoExtractMemory,
      setExtractorModel,
      toggleFavoriteModel,
      pendingApproval,
      respondApproval,
      getAiContext: () =>
        activeQuarkId && resolveAiContext
          ? safeBuildAiContext(activeQuarkId, resolveAiContext)
          : null,
    }),
    [
      panelOpen,
      inspectorOpen,
      config,
      conversations,
      openTabIds,
      active,
      activeQuarkId,
      status,
      error,
      apiKeyConfigured,
      open,
      close,
      toggle,
      toggleInspector,
      refreshApiKey,
      onOpenSettings,
      selectConversation,
      createNew,
      removeConversation,
      closeTab,
      clearMessages,
      renameConversation,
      sendMessage,
      stop,
      setMode,
      setModel,
      setAttachContext,
      setRagEnabled,
      setAutoExtractMemory,
      setExtractorModel,
      toggleFavoriteModel,
      pendingApproval,
      respondApproval,
      resolveAiContext,
    ],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Captura el `buildAiContext()` del quark vía el resolver del Shell, sin dejar
 * que un bug del quark rompa el turno.
 */
function safeBuildAiContext(
  activeQuarkId: string,
  resolve: (id: string) => AiContext | null,
): AiContext | null {
  try {
    return resolve(activeQuarkId);
  } catch (e) {
    report(`${activeQuarkId}.buildAiContext`, e);
    return null;
  }
}

/**
 * Devuelve el value del provider. Lanza si se usa afuera (señal clara de bug,
 * mejor que un default silencioso). Los consumidores típicos: el Panel de
 * Quarky, el header (botón "Quarky" si lo agregamos), y los quarks vía
 * `@quarks/core`.
 */
export function useQuarky(): QuarkyContextValue {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useQuarky() debe usarse adentro de <QuarkyProvider>.");
  }
  return ctx;
}
