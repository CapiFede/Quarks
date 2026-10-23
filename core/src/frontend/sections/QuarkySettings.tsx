/**
 * Sección "Quarky" del modal de Settings: API key, modelo y memoria (RAG +
 * auto-extracción).
 *
 * Vive en archivo aparte (y no inline en `Settings.tsx`) para mantener la
 * cohesión por subsistema: los prompts y el viewer de memoria viven en el
 * inspector del panel, y acá solo lo que se configura una vez.
 *
 * El componente lee/escribe directo a `quarky/config.json` y al keyring; el
 * `useQuarky()` del context se sincroniza vía `setModel` (los demás campos los
 * lee al montar, que es lo que importa porque el panel todavía no estaría
 * abierto al editar Settings).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { TextInput } from "../components/TextInput";
import { Button } from "../components/Button";
import { ModelPicker } from "./Quarky/ModelPicker";
import { deleteSecret, getSecret, setSecret } from "../../services/secrets";
import { OPENROUTER_KEY } from "../../quarky/provider";
import { useQuarky } from "../../quarky/hooks/useQuarky";
import { report } from "../../services/log";
import { Toggle } from "../components/Toggle";

export function QuarkySettings() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ApiKeyRow />
      <ModelRow />
      <MemoryRow />
    </div>
  );
}

// ── API key ──────────────────────────────────────────────────────────────────

function ApiKeyRow() {
  const { refreshApiKey } = useQuarky();
  const [stored, setStored] = useState<boolean | null>(null); // null = loading
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getSecret(OPENROUTER_KEY)
      .then((v) => setStored(!!v))
      .catch((e) => {
        report("quarky.getApiKey", e);
        setStored(false);
      });
  }, []);

  const save = async () => {
    const v = draft.trim();
    if (!v) return;
    setSaving(true);
    setError(null);
    try {
      await setSecret(OPENROUTER_KEY, v);
      setStored(true);
      setDraft("");
      setEditing(false);
      // Notificar al provider para que el panel deje de mostrar el empty state
      // "Configurá Quarky" sin tener que cerrar/reabrir.
      await refreshApiKey();
    } catch (e) {
      report("quarky.setApiKey", e);
      setError("No se pudo guardar la API key.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteSecret(OPENROUTER_KEY);
      setStored(false);
      await refreshApiKey();
    } catch (e) {
      report("quarky.deleteApiKey", e);
    }
  };

  return (
    <Section
      title="API key de OpenRouter"
      hint="La key se guarda en el almacén nativo del SO (keyring), nunca en archivos JSON."
    >
      {stored === null ? (
        <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-text-light)" }}>
          Cargando…
        </div>
      ) : editing || !stored ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <TextInput
            value={draft}
            onChange={setDraft}
            placeholder="sk-or-..."
            icon="key"
            style={{ flex: 1 }}
          />
          <Button
            variant="filled"
            icon="save"
            disabled={!draft.trim() || saving}
            onClick={() => void save()}
          >
            Guardar
          </Button>
          {stored && (
            <Button variant="text" onClick={() => {
              setEditing(false);
              setDraft("");
            }}>
              Cancelar
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Status configured />
          <span style={{ flex: 1, fontSize: "var(--q-fs-12)", color: "var(--q-text-secondary)" }}>
            API key configurada en el keyring.
          </span>
          <Button variant="outlined" icon="edit" onClick={() => setEditing(true)}>
            Cambiar
          </Button>
          <Button variant="destructive" icon="delete" onClick={() => void remove()}>
            Borrar
          </Button>
        </div>
      )}
      {error && (
        <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-error)" }}>{error}</div>
      )}
    </Section>
  );
}

function Status({ configured }: { configured: boolean }) {
  return (
    <span
      title={configured ? "Configurada" : "Sin configurar"}
      style={{
        width: 8,
        height: 8,
        borderRadius: 9999,
        background: configured ? "var(--q-success)" : "var(--q-text-light)",
        flex: "0 0 auto",
      }}
    />
  );
}

// ── Modelo ───────────────────────────────────────────────────────────────────

function ModelRow() {
  // El config canónico vive en el QuarkyProvider, así que cuando lo cambiamos
  // acá usamos sus acciones (`setModel`, `toggleFavoriteModel`) para que el
  // panel quede en sync sin un re-read del disco.
  const quarky = useQuarky();

  return (
    <Section
      title="Modelo"
      hint="Marcá con estrella los que uses seguido; aparecen en el dropdown rápido del panel."
    >
      <ModelPicker
        value={quarky.config.model}
        favorites={quarky.config.favoriteModels}
        onChange={(id) => void quarky.setModel(id)}
        onToggleFavorite={(id) => void quarky.toggleFavoriteModel(id)}
      />
    </Section>
  );
}

// ── Memoria ──────────────────────────────────────────────────────────────────

function MemoryRow() {
  const quarky = useQuarky();
  return (
    <Section
      title="Memoria"
      hint="RAG: solo inyecta pinneadas + top-10 más relevantes al mensaje (requiere descargar un modelo de ~33MB la primera vez). Captura automática: después de cada respuesta del asistente, un modelo barato/gratis mira los últimos mensajes y decide si guardar hechos durables. Ambos son opt-in."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <ToggleRow
          label="Retrieval semántico (RAG)"
          checked={quarky.config.ragEnabled}
          onChange={(v) => void quarky.setRagEnabled(v)}
        />
        <ToggleRow
          label="Capturar memorias automáticamente"
          checked={quarky.config.autoExtractMemory}
          onChange={(v) => void quarky.setAutoExtractMemory(v)}
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
          <label
            style={{
              fontSize: "var(--q-fs-11)",
              color: "var(--q-text-light)",
            }}
          >
            Modelo para extracción/consolidación
          </label>
          <ExtractorModelField />
          <span style={{ fontSize: "var(--q-fs-10)", color: "var(--q-text-light)" }}>
            Cualquier modelo de OpenRouter. Los <code>:free</code> alcanzan; el principal del chat se elige aparte arriba.
          </span>
        </div>
      </div>
    </Section>
  );
}

/**
 * Draft local + commit en blur/Enter: `setExtractorModel` hace un
 * read-modify-write de `config.json`, y dispararlo por tecla era una escritura
 * a disco (y una carrera) por pulsación.
 */
function ExtractorModelField() {
  const { config, setExtractorModel } = useQuarky();
  const [draft, setDraft] = useState(config.extractorModel);
  useEffect(() => {
    setDraft(config.extractorModel);
  }, [config.extractorModel]);
  const commit = () => {
    const v = draft.trim();
    if (v !== config.extractorModel) void setExtractorModel(v);
  };
  return (
    <TextInput
      value={draft}
      onChange={setDraft}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder="google/gemma-3-27b-it:free"
      icon="smart_toy"
    />
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        fontSize: "var(--q-fs-12)",
        color: "var(--q-text-primary)",
      }}
    >
      {label}
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Layout helpers ───────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontSize: "var(--q-fs-13)",
          fontWeight: "var(--q-fw-medium)",
          color: "var(--q-text-primary)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name="smart_toy" size={14} color="var(--q-text-light)" />
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: "var(--q-fs-11)", color: "var(--q-text-light)" }}>{hint}</div>
      )}
      {children}
    </div>
  );
}
