/**
 * Overlay que muestra y permite editar el contexto que se manda al modelo:
 *
 *   1. Header compacto: nombre del modelo + tokens consumidos en la conversación.
 *   2. Prompt general (`contexts/general.md`) — editable.
 *   3. Prompt del quark activo (`contexts/<quarkId>.md`) — editable, solo si hay
 *      un quark abierto.
 *   4. Mensajes serializados al wire format (read-only).
 *   5. Tools del modo activo (read-only).
 *   6. Memoria — CRUD sobre `quarky/memory.json` (categoría + pin toggle + filtros).
 *
 * El overlay reemplaza al `MessageList` cuando `inspectorOpen` es true. Las
 * secciones son colapsables; el open-state es interno (no persiste).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { toApiMessages } from "../../../quarky/provider";
import { buildSystemPrompt } from "../../../quarky/systemPrompt";
import {
  DEFAULT_GENERAL_PROMPT,
  readGeneralPrompt,
  readQuarkPrompt,
  writeGeneralPrompt,
  writeQuarkPrompt,
} from "../../../quarky/contexts";
import {
  addEntry as addMemoryEntry,
  backfillEmbeddings,
  deleteEntry as deleteMemoryEntry,
  embeddingCoverage,
  listEntries as listMemoryEntries,
  updateEntry as updateMemoryEntry,
} from "../../../quarky/memory/store";
import {
  MEMORY_CATEGORIES,
  type MemoryCategory,
  type MemoryEntry,
} from "../../../quarky/memory/types";
import {
  ensureEmbedderLoading,
  getEmbedderStatus,
  subscribeEmbedder,
  type EmbedderInfo,
} from "../../../quarky/memory/embeddings";
import { probeEmbedder } from "../../../quarky/memory/retrieve";
import { allTools } from "../../../quarky/tools/registry";
import { schemasForMode } from "../../../quarky/tools/policy";
import { getQuark } from "../../../quark/registry";
import type { AiContext } from "../../../quark/types";
import { Icon } from "../../components/Icon";
import { IconButton } from "../../components/IconButton";
import { Button } from "../../components/Button";
import { report } from "../../../services/log";

export function ContextInspector() {
  const { activeQuarkId } = useQuarky();
  const quarkMeta = activeQuarkId ? getQuark(activeQuarkId) : undefined;
  // Identidad estable: `PromptSection` los tiene como deps de su efecto de
  // carga; con arrows inline releía el `.md` del disco en cada render.
  const loadQuarkPrompt = useCallback(() => readQuarkPrompt(activeQuarkId ?? ""), [activeQuarkId]);
  const saveQuarkPrompt = useCallback(
    (c: string) => writeQuarkPrompt(activeQuarkId ?? "", c),
    [activeQuarkId],
  );

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Header />

      <PromptSection
        title="Prompt general"
        subtitle="Aplica a todas las conversaciones."
        load={readGeneralPrompt}
        save={writeGeneralPrompt}
        defaultValue={DEFAULT_GENERAL_PROMPT}
        defaultOpen
      />

      {activeQuarkId && (
        <PromptSection
          key={activeQuarkId}
          title={`Prompt del quark · ${quarkMeta?.name ?? activeQuarkId}`}
          subtitle="Solo se inyecta cuando este quark está abierto."
          load={loadQuarkPrompt}
          save={saveQuarkPrompt}
          defaultValue=""
          placeholder="Instrucciones específicas para cuando este quark está abierto…"
        />
      )}

      <MessagesSection />

      <ToolsSection />

      <MemorySection />

      <EmbeddingsSection />
    </div>
  );
}

// ── Header con stats ─────────────────────────────────────────────────────────

function Header() {
  const { config, active } = useQuarky();
  const { promptTokens, completionTokens } = useMemo(
    () => sumUsage(active?.messages),
    [active?.messages],
  );
  const model = shortModelLabel(config.model);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 8,
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border)",
      }}
    >
      <Icon name="data_object" size={14} color="var(--q-text-light)" />
      <span
        className="q-mono"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "var(--q-fs-12)",
          color: "var(--q-text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={config.model}
      >
        {model}
      </span>
      <TokenStat icon="south_west" label="in" value={promptTokens} />
      <TokenStat icon="north_east" label="out" value={completionTokens} />
    </div>
  );
}

function TokenStat({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <span
      title={`${value} tokens de ${label === "in" ? "entrada" : "salida"} en la conversación`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-light)",
      }}
    >
      <Icon name={icon} size={11} />
      {formatTokens(value)}
    </span>
  );
}

// ── Editor de prompt (general o de quark) ────────────────────────────────────

function PromptSection({
  title,
  subtitle,
  load,
  save,
  defaultValue,
  placeholder,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  load: () => Promise<string>;
  save: (content: string) => Promise<void>;
  defaultValue: string;
  placeholder?: string;
  defaultOpen?: boolean;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void load()
      .then((c) => {
        if (alive) setContent(c);
      })
      .catch((e) => {
        report("quarky.inspector.loadPrompt", e);
        if (alive) setContent("");
      });
    return () => {
      alive = false;
    };
  }, [load]);

  const startEdit = () => {
    setDraft(content ?? "");
    setEditing(true);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      await save(draft);
      setContent(draft);
      setEditing(false);
    } catch (e) {
      report("quarky.inspector.savePrompt", e);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setDraft(defaultValue);
  };

  const chars = content?.length ?? 0;
  const isEmpty = !content?.trim();

  return (
    <Section
      title={title}
      subtitle={isEmpty && !editing ? "vacío" : `${chars} caracteres`}
      defaultOpen={defaultOpen}
    >
      {subtitle && (
        <div
          style={{
            fontSize: "var(--q-fs-11)",
            color: "var(--q-text-light)",
            margin: "6px 0 0",
          }}
        >
          {subtitle}
        </div>
      )}
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={8}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 10,
              background: "var(--q-background)",
              border: "1px solid var(--q-border-dark)",
              borderRadius: 6,
              color: "var(--q-text-primary)",
              fontFamily: "var(--q-font-mono)",
              fontSize: "var(--q-fs-11)",
              lineHeight: "var(--q-lh-relaxed)",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button variant="text" onClick={reset}>
              Restablecer
            </Button>
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button
              variant="filled"
              icon="save"
              disabled={saving}
              onClick={() => void doSave()}
            >
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <>
          {isEmpty ? (
            <Empty>{placeholder ?? "Sin contenido. Editá para agregar instrucciones."}</Empty>
          ) : (
            <Pre>{content!}</Pre>
          )}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 6 }}>
            <Button variant="outlined" icon="edit" onClick={startEdit}>
              Editar
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

// ── Mensajes serializados (debug / inspección) ───────────────────────────────

function MessagesSection() {
  const { active, activeQuarkId, config, getAiContext } = useQuarky();
  const [systemPrompt, setSystemPrompt] = useState("");
  // Para previsualizar el system prompt en el inspector usamos el último mensaje
  // del usuario como query del retrieval. Si todavía no hay ninguno (conv vacía),
  // mandamos string vacío → RAG cae a "solo pinned".
  const lastUserMessage =
    [...(active?.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "";
  // Snapshot del aiContext que el quark activo aportaría AHORA mismo. Lo
  // recalculamos cada vez que el inspector se monta o cambia el quark activo.
  const aiContext = useMemo<AiContext | null>(() => {
    if (!activeQuarkId) return null;
    let ctx: AiContext | null;
    try {
      ctx = getAiContext();
    } catch (e) {
      report("quarky.inspector.buildAiContext", e);
      return null;
    }
    // Respetamos el toggle: si está apagado, `sendMessage` conserva las
    // instructions pero saca los attachments. Reflejamos lo mismo acá.
    if (ctx && active?.attachContext === false) return { ...ctx, attachments: [] };
    return ctx;
    // `getAiContext` cambia identity solo cuando cambia el quark/resolver, así
    // que listarlo es seguro y evita warnings de exhaustive-deps.
  }, [activeQuarkId, active?.attachContext, active?.updatedAt, getAiContext]);

  useEffect(() => {
    let alive = true;
    void buildSystemPrompt({
      activeQuarkId,
      aiContext,
      userMessage: lastUserMessage,
      ragEnabled: config.ragEnabled,
    })
      .then((s) => {
        if (alive) setSystemPrompt(s);
      })
      .catch((e) => {
        report("quarky.inspector.buildPrompt", e);
        if (alive) setSystemPrompt("");
      });
    return () => {
      alive = false;
    };
  }, [activeQuarkId, aiContext, active?.messages.length, lastUserMessage, config.ragEnabled]);

  const apiMessages = active ? toApiMessages(systemPrompt, active) : [];

  return (
    <>
      {aiContext && (
        <Section
          title="Contexto del quark"
          subtitle={[
            aiContext.instructions ? "instructions" : null,
            aiContext.attachments?.length
              ? `${aiContext.attachments.length} attachment${aiContext.attachments.length === 1 ? "" : "s"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "vacío"}
        >
          {aiContext.instructions && <Pre>{aiContext.instructions}</Pre>}
          {(aiContext.attachments ?? []).map((a, i) => (
            <div key={i} style={{ marginTop: 6 }}>
              <div
                style={{
                  fontSize: "var(--q-fs-10)",
                  color: "var(--q-text-light)",
                  fontFamily: "var(--q-font-mono)",
                }}
              >
                [{a.label}]
              </div>
              <Pre>{a.content}</Pre>
            </div>
          ))}
        </Section>
      )}
      <Section title="Mensajes" subtitle={`${apiMessages.length} ítems`}>
        {active && active.messages.length > 0 ? (
          <Pre>{JSON.stringify(apiMessages, null, 2)}</Pre>
        ) : (
          <Empty>Sin mensajes todavía en esta conversación.</Empty>
        )}
      </Section>
    </>
  );
}

// ── Tools del modo activo ────────────────────────────────────────────────────

function ToolsSection() {
  const { active, config } = useQuarky();
  const mode = active?.mode ?? config.modeDefault;
  const schemas = useMemo(() => schemasForMode(mode, allTools()), [mode]);
  return (
    <Section
      title="Tools"
      subtitle={`${schemas.length} disponible${schemas.length === 1 ? "" : "s"} en modo ${mode === "ask" ? "Ask" : "Agent"}`}
    >
      {schemas.length === 0 ? (
        <Empty>El modo actual no expone tools al modelo.</Empty>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {schemas.map((s) => (
            <ToolRow key={s.function.name} schema={s} />
          ))}
        </div>
      )}
    </Section>
  );
}

function ToolRow({ schema }: { schema: ReturnType<typeof allTools>[number]["schema"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--q-border)",
        borderRadius: 6,
        background: "var(--q-background)",
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          padding: "6px 8px",
          cursor: "default",
        }}
      >
        <Icon
          name={open ? "expand_more" : "chevron_right"}
          size={12}
          color="var(--q-text-light)"
          style={{ marginTop: 2 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="q-mono"
            style={{
              fontSize: "var(--q-fs-11)",
              fontWeight: "var(--q-fw-semibold)",
              color: "var(--q-text-primary)",
            }}
          >
            {schema.function.name}
          </div>
          <div
            style={{
              fontSize: "var(--q-fs-10)",
              color: "var(--q-text-light)",
              lineHeight: 1.4,
              marginTop: 2,
            }}
          >
            {schema.function.description}
          </div>
        </div>
      </div>
      {open && (
        <pre
          className="q-mono"
          style={{
            margin: 0,
            padding: "8px 10px",
            borderTop: "1px solid var(--q-border)",
            background: "var(--q-surface-alt)",
            fontSize: "var(--q-fs-10)",
            color: "var(--q-text-light)",
            lineHeight: "var(--q-lh-snug)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          {JSON.stringify(schema.function.parameters, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Memoria: CRUD ────────────────────────────────────────────────────────────

function MemorySection() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [newText, setNewText] = useState("");
  const [newCategory, setNewCategory] = useState<MemoryCategory>("fact");
  const [filterCategory, setFilterCategory] = useState<MemoryCategory | "all">("all");

  const refresh = async () => {
    try {
      setEntries(await listMemoryEntries());
    } catch (e) {
      report("quarky.inspector.listMemory", e);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    if (!newText.trim()) return;
    try {
      await addMemoryEntry({ text: newText, category: newCategory });
      setNewText("");
      setNewCategory("fact");
      setCreating(false);
      await refresh();
    } catch (e) {
      report("quarky.inspector.createMemory", e);
    }
  };

  const visible =
    filterCategory === "all" ? entries : entries.filter((e) => e.category === filterCategory);
  const counts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Section title="Memoria" subtitle={`${entries.length} entrada${entries.length === 1 ? "" : "s"}`}>
      {entries.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          <CategoryChip
            label="todas"
            count={entries.length}
            active={filterCategory === "all"}
            onClick={() => setFilterCategory("all")}
          />
          {MEMORY_CATEGORIES.filter((c) => (counts[c] ?? 0) > 0).map((c) => (
            <CategoryChip
              key={c}
              label={c}
              count={counts[c] ?? 0}
              active={filterCategory === c}
              onClick={() => setFilterCategory(c)}
            />
          ))}
        </div>
      )}
      {entries.length === 0 && !creating && (
        <Empty>
          Sin entradas. La memoria se inyecta envuelta en UNTRUSTED_CONTEXT en cada
          turno (el modelo no obedece instrucciones que vengan adentro).
        </Empty>
      )}
      {visible.map((m) => (
        <MemoryRow key={m.id} entry={m} onChange={refresh} />
      ))}
      {creating ? (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid var(--q-border)",
            borderRadius: 6,
            background: "var(--q-background)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Hecho durable a recordar (p. ej. 'el usuario prefiere respuestas cortas')…"
            rows={4}
            style={textareaStyle}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {MEMORY_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={newCategory === c}
                onClick={() => setNewCategory(c)}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button
              variant="text"
              onClick={() => {
                setCreating(false);
                setNewText("");
                setNewCategory("fact");
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="filled"
              icon="check"
              disabled={!newText.trim()}
              onClick={() => void create()}
            >
              Agregar
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
          <Button variant="outlined" icon="add" onClick={() => setCreating(true)}>
            Nueva entrada
          </Button>
        </div>
      )}
    </Section>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        cursor: "pointer",
        border: `1px solid ${active ? "var(--q-text-light)" : "var(--q-border)"}`,
        background: active ? "var(--q-surface-alt)" : "transparent",
        color: active ? "var(--q-text-primary)" : "var(--q-text-light)",
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: "var(--q-fs-10)",
        fontFamily: "var(--q-font-mono)",
        lineHeight: 1.6,
      }}
    >
      {label}
      {count !== undefined ? ` · ${count}` : ""}
    </button>
  );
}

function MemoryRow({
  entry,
  onChange,
}: {
  entry: MemoryEntry;
  onChange: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const [draftCategory, setDraftCategory] = useState<MemoryCategory>(entry.category);

  const save = async () => {
    try {
      await updateMemoryEntry(entry.id, { text: draft, category: draftCategory });
      setEditing(false);
      await onChange();
    } catch (e) {
      report("quarky.inspector.saveMemory", e);
    }
  };

  const remove = async () => {
    try {
      await deleteMemoryEntry(entry.id);
      await onChange();
    } catch (e) {
      report("quarky.inspector.deleteMemory", e);
    }
  };

  const togglePin = async () => {
    try {
      await updateMemoryEntry(entry.id, { pinned: !entry.pinned });
      await onChange();
    } catch (e) {
      report("quarky.inspector.pinMemory", e);
    }
  };

  return (
    <div
      style={{
        marginTop: 8,
        padding: 10,
        border: "1px solid var(--q-border)",
        borderRadius: 6,
        background: "var(--q-background)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CategoryChip label={entry.category} active onClick={() => {}} />
        <span
          className="q-mono"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: "var(--q-fs-10)",
            color: "var(--q-text-light)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={`id: ${entry.id} · usos: ${entry.uses}`}
        >
          {entry.id}
          {entry.uses > 0 ? ` · ${entry.uses} uso${entry.uses === 1 ? "" : "s"}` : ""}
        </span>
        {!editing && (
          <>
            <IconButton
              name={entry.pinned ? "push_pin" : "keep_off"}
              tooltip={entry.pinned ? "Despinear" : "Pinear (siempre inyectada)"}
              onClick={() => void togglePin()}
            />
            <IconButton
              name="edit"
              tooltip="Editar"
              onClick={() => {
                setDraft(entry.text);
                setDraftCategory(entry.category);
                setEditing(true);
              }}
            />
            <IconButton name="delete" tooltip="Borrar" onClick={() => void remove()} />
          </>
        )}
      </div>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            style={textareaStyle}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {MEMORY_CATEGORIES.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={draftCategory === c}
                onClick={() => setDraftCategory(c)}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button variant="text" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button variant="filled" icon="save" onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 6,
            fontSize: "var(--q-fs-11)",
            color: "var(--q-text-secondary)",
            lineHeight: "var(--q-lh-snug)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 120,
            overflow: "auto",
          }}
        >
          {entry.text}
        </div>
      )}
    </div>
  );
}

// ── Embeddings: status + coverage + recalcular ───────────────────────────────

function EmbeddingsSection() {
  const { config } = useQuarky();
  const [info, setInfo] = useState<EmbedderInfo>(() => getEmbedderStatus());
  const [coverage, setCoverage] = useState<{ withEmbedding: number; total: number }>({
    withEmbedding: 0,
    total: 0,
  });
  const [working, setWorking] = useState(false);

  const refreshCoverage = async () => {
    try {
      setCoverage(await embeddingCoverage());
    } catch (e) {
      report("quarky.inspector.coverage", e);
    }
  };

  useEffect(() => {
    void refreshCoverage();
    // Snapshot inicial + suscripción: cada cambio (status/progress/error) re-lee
    // el snapshot completo y actualiza el state.
    setInfo(getEmbedderStatus());
    return subscribeEmbedder(() => setInfo(getEmbedderStatus()));
  }, []);

  // Si RAG está prendido pero el modelo no arrancó, lo precalentamos. Sin esto,
  // un usuario que activa RAG y no tiene memoria nunca dispara la descarga y
  // no ve nada (todo el retrieval cortocircuita en "sin entradas").
  useEffect(() => {
    if (config.ragEnabled && info.status === "idle") ensureEmbedderLoading();
  }, [config.ragEnabled, info.status]);

  const onRecalculate = async () => {
    setWorking(true);
    try {
      ensureEmbedderLoading();
      await backfillEmbeddings();
      await refreshCoverage();
    } catch (e) {
      report("quarky.inspector.backfill", e);
    } finally {
      setWorking(false);
    }
  };

  const onProbe = async () => {
    setWorking(true);
    try {
      await probeEmbedder();
    } catch (e) {
      report("quarky.inspector.probe", e);
    } finally {
      setWorking(false);
    }
  };

  // El subtítulo siempre incluye el status del modelo, así el usuario ve que
  // está pasando algo incluso con 0 entradas.
  const subtitle = (() => {
    const modelPart = `modelo: ${statusLabel(info.status)}`;
    if (coverage.total === 0) return modelPart;
    return `${coverage.withEmbedding}/${coverage.total} indexadas · ${modelPart}`;
  })();

  return (
    <Section title="Embeddings" subtitle={subtitle}>
      <div
        style={{
          fontSize: "var(--q-fs-11)",
          color: "var(--q-text-light)",
          margin: "6px 0",
          lineHeight: 1.5,
        }}
      >
        {config.ragEnabled
          ? "RAG activo. Las entradas no-pinned se rankean por similitud al mensaje del usuario; las pinned siempre se inyectan. El modelo se descarga la primera vez (~33MB modelo + ~23MB WASM) y queda cacheado."
          : "RAG desactivado en Settings. Se inyectan TODAS las entradas en cada turno (modo legacy)."}
      </div>
      {info.status === "loading" && (
        <div
          className="q-mono"
          style={{
            fontSize: "var(--q-fs-11)",
            color: "var(--q-text-secondary)",
            margin: "4px 0",
            padding: "6px 8px",
            background: "var(--q-background)",
            border: "1px solid var(--q-border-dark)",
            borderRadius: 6,
          }}
        >
          {info.progressLabel ?? "cargando modelo…"}
        </div>
      )}
      {info.status === "ready" && coverage.total === 0 && (
        <div
          style={{
            fontSize: "var(--q-fs-11)",
            color: "var(--q-success)",
            margin: "4px 0",
          }}
        >
          Modelo cargado. Agregá una entrada para verlo indexar.
        </div>
      )}
      {info.status === "error" && (
        <div
          style={{
            fontSize: "var(--q-fs-11)",
            color: "var(--q-error)",
            margin: "4px 0",
          }}
        >
          Falló la carga del modelo ({info.error ?? "error desconocido"}). El retrieval va a degradar a "solo pinned".
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
        <Button
          variant="outlined"
          icon="bolt"
          disabled={working || info.status === "loading"}
          onClick={() => void onProbe()}
        >
          {info.status === "ready" ? "Probar embed" : "Cargar modelo"}
        </Button>
        <Button
          variant="outlined"
          icon="refresh"
          disabled={working || coverage.total === 0}
          onClick={() => void onRecalculate()}
        >
          {working ? "Indexando…" : "Recalcular faltantes"}
        </Button>
      </div>
    </Section>
  );
}

function statusLabel(s: EmbedderInfo["status"]): string {
  switch (s) {
    case "idle":
      return "sin cargar";
    case "loading":
      return "cargando…";
    case "ready":
      return "listo";
    case "error":
      return "error";
  }
}

// ── Helpers visuales reutilizables ───────────────────────────────────────────

const textareaStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: 10,
  background: "var(--q-surface-alt)",
  border: "1px solid var(--q-border)",
  borderRadius: 6,
  color: "var(--q-text-primary)",
  fontFamily: "var(--q-font-mono)",
  fontSize: "var(--q-fs-11)",
  lineHeight: "var(--q-lh-relaxed)",
  resize: "vertical" as const,
  outline: "none",
};

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        border: "1px solid var(--q-border)",
        borderRadius: 8,
        overflow: "hidden",
        background: "var(--q-surface-alt)",
        flexShrink: 0,
      }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 10px",
          cursor: "default",
          color: "var(--q-text-primary)",
        }}
      >
        <Icon name={open ? "expand_more" : "chevron_right"} size={14} />
        <span
          style={{
            fontSize: "var(--q-fs-12)",
            fontWeight: "var(--q-fw-semibold)",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            style={{
              fontSize: "var(--q-fs-10)",
              color: "var(--q-text-light)",
              marginLeft: "auto",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {open && (
        <div style={{ padding: "0 10px 10px 10px", borderTop: "1px solid var(--q-border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      className="q-mono"
      style={{
        margin: "8px 0 0",
        padding: "8px 10px",
        background: "var(--q-background)",
        border: "1px solid var(--q-border-dark)",
        borderRadius: 6,
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-secondary)",
        lineHeight: "var(--q-lh-snug)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: 280,
        overflow: "auto",
      }}
    >
      {children}
    </pre>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-light)",
        padding: "8px 0 4px",
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

// ── Helpers de datos ─────────────────────────────────────────────────────────

function sumUsage(messages: { usage?: { promptTokens: number; completionTokens: number } }[] | undefined) {
  let promptTokens = 0;
  let completionTokens = 0;
  for (const m of messages ?? []) {
    if (!m.usage) continue;
    promptTokens += m.usage.promptTokens;
    completionTokens += m.usage.completionTokens;
  }
  return { promptTokens, completionTokens };
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** Acorta `provider/name` → `name` para que entre en el header del inspector. */
function shortModelLabel(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}
