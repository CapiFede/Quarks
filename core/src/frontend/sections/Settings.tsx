import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { Toggle } from "../components/Toggle";
import { Button } from "../components/Button";
import { QuarkySettings } from "./QuarkySettings";
import { isAutostartEnabled, setAutostart } from "../../services/autostart";
import { isAndroid } from "../../services/platform";
import { hasGoogleCredentials } from "../../services/account/config";
import type { SyncController, SyncOp } from "../hooks/useSync";
import { isClean, type SyncDelta, type SyncProgress } from "../../services/account/sync";
import type { UpdaterController } from "../hooks/useUpdater";
import type {
  AccountInfo,
  AccountStatus,
  ProviderId,
} from "../../services/account/types";
import { ProgressBar } from "../components/ProgressBar";

const APP_VERSION = __APP_VERSION__;

export type SectionId = "general" | "quarky" | "account";

const NAV: { id: SectionId; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "tune" },
  { id: "quarky", label: "Quarky", icon: "smart_toy" },
  { id: "account", label: "Cuenta", icon: "account_circle" },
];

export interface SettingsProps {
  open: boolean;
  onClose: () => void;
  /** Si se pasa, al abrir salta directo a esa sección. */
  initialSection?: SectionId;
  account: AccountInfo | null;
  status: AccountStatus;
  error: string | null;
  onConnect: (providerId?: ProviderId) => void;
  onDisconnect: () => void;
  updater: UpdaterController;
  /** Vive en el Shell para que una operación larga sobreviva a cerrar el popup. */
  sync: SyncController;
}

/** Popup de configuración: nav lateral + secciones. Escape o click afuera cierra. */
export function Settings({
  open,
  onClose,
  initialSection,
  account,
  status,
  error,
  onConnect,
  onDisconnect,
  updater,
  sync,
}: SettingsProps) {
  const [section, setSection] = useState<SectionId>("general");

  // Al abrir desde un atajo (titlebar, "Iniciar sesión") salta a esa sección.
  useEffect(() => {
    if (open && initialSection) setSection(initialSection);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.45)",
          zIndex: 100,
        }}
      />
      {/* Card */}
      <div
        role="dialog"
        aria-modal
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: isAndroid ? "96vw" : "min(720px, 92vw)",
          height: isAndroid ? "88vh" : "min(560px, 84vh)",
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          background: "var(--q-surface)",
          border: "1px solid var(--q-border-dark)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,.28)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            flex: "0 0 48px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 12px 0 16px",
            borderBottom: "1px solid var(--q-border)",
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--q-text-primary)",
              flex: 1,
            }}
          >
            Configuración
          </span>
          <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
        </header>

        {/* En mobile la nav lateral de 180px se comía media pantalla: pasa a ser
            una fila de tabs arriba y el contenido usa todo el ancho. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: isAndroid ? "column" : "row",
          }}
        >
          <nav
            style={
              isAndroid
                ? {
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "stretch",
                    borderBottom: "1px solid var(--q-border)",
                    overflowX: "auto",
                  }
                : {
                    flex: "0 0 180px",
                    borderRight: "1px solid var(--q-border)",
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }
            }
          >
            {NAV.map((item) =>
              isAndroid ? (
                <TabItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={section === item.id}
                  onClick={() => setSection(item.id)}
                />
              ) : (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={section === item.id}
                  onClick={() => setSection(item.id)}
                />
              ),
            )}
          </nav>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: isAndroid ? "16px 14px" : 20,
            }}
          >
            {section === "general" && <GeneralSection updater={updater} />}
            {section === "quarky" && <QuarkySettings />}
            {section === "account" && (
              <AccountSection
                account={account}
                status={status}
                error={error}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                sync={sync}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 6,
        cursor: "default",
        background: active
          ? "var(--q-primary-soft)"
          : hover
            ? "var(--q-card-hover)"
            : "transparent",
        color: active ? "var(--q-primary-light)" : "var(--q-text-primary)",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={16} />
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 500 }}>{label}</span>
    </div>
  );
}

/**
 * Variante mobile del `NavItem`: tab horizontal con subrayado en el activo,
 * al estilo de las tabs de una app nativa.
 */
function TabItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: "1 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "10px 12px",
        cursor: "default",
        whiteSpace: "nowrap",
        borderBottom: `2px solid ${active ? "var(--q-primary-light)" : "transparent"}`,
        color: active ? "var(--q-primary-light)" : "var(--q-text-secondary)",
        transition: "color var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={16} />
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 500 }}>{label}</span>
    </div>
  );
}

// ── Secciones ────────────────────────────────────────────────────────────────

function GeneralSection({ updater }: { updater: UpdaterController }) {
  // Autostart es desktop-only (plugin no aplica en Android: el OS gestiona el
  // arranque de apps por su cuenta). En Android directamente no mostramos la fila.
  const canAutostart = isTauri() && !isAndroid;
  const [autostartOn, setAutostartOn] = useState(false);

  useEffect(() => {
    if (isAndroid) return;
    let alive = true;
    void isAutostartEnabled().then((v) => {
      if (alive) setAutostartOn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggleAutostart = (next: boolean) => {
    setAutostartOn(next); // optimista
    setAutostart(next).catch(() => setAutostartOn(!next));
  };

  const canOpenFolder = isTauri() && !isAndroid;
  const openDataFolder = async () => {
    // No envolvemos en try/catch: si el opener falla (capability, path raro)
    // queremos verlo en la consola para depurar, no comernos el error en silencio.
    const dir = await appDataDir();
    await openPath(dir);
  };

  return (
    <SectionBody>
      <AppHeader />
      <p style={{ fontSize: 13, color: "var(--q-text-secondary)", lineHeight: 1.5, maxWidth: 420, margin: 0 }}>
        Suite of simple apps
      </p>
      {!isAndroid && (
        <Row
          label="Arrancar con el sistema"
          hint={
            canAutostart
              ? "Abre Quarks al iniciar sesión."
              : "Disponible solo en la app de escritorio."
          }
        >
          <Toggle
            checked={autostartOn}
            onChange={toggleAutostart}
            disabled={!canAutostart}
          />
        </Row>
      )}
      {!isAndroid && (
        <Row
          label="Carpeta de datos"
          hint="Ahí viven la configuración y el contenido de cada quark."
        >
          <Button
            variant="outlined"
            icon="folder_open"
            disabled={!canOpenFolder}
            onClick={() => void openDataFolder()}
          >
            Abrir carpeta
          </Button>
        </Row>
      )}
      <UpdaterPanel updater={updater} />
    </SectionBody>
  );
}

/** Cabecera de identidad de la app: logo + nombre + versión. Vive en General
 *  (antes era la sección "Acerca de", ahora fusionada). */
function AppHeader() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          background: "var(--q-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="hub" size={26} color="#fff" />
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--q-text-primary)" }}>
          Quarks
        </div>
        <div
          className="q-mono"
          style={{ fontSize: 11, color: "var(--q-text-secondary)" }}
        >
          versión {APP_VERSION}
        </div>
      </div>
    </div>
  );
}

function AccountSection({
  account,
  status,
  error,
  onConnect,
  onDisconnect,
  sync,
}: {
  account: AccountInfo | null;
  status: AccountStatus;
  error: string | null;
  onConnect: (providerId?: ProviderId) => void;
  onDisconnect: () => void;
  sync: SyncController;
}) {
  const canConnect = hasGoogleCredentials();
  const connecting = status === "connecting";

  return (
    <SectionBody>
      {account ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 9999,
              background: "var(--q-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            <Icon name="account_circle" size={24} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
              {account.providerLabel}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--q-text-primary)" }}>
              {account.name}
            </div>
            <div style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
              {account.email}
            </div>
          </div>
          <Button variant="destructive" icon="logout" onClick={onDisconnect}>
            Desconectar
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
          <Button
            variant="filled"
            icon="cloud"
            disabled={!canConnect || connecting}
            onClick={() => onConnect()}
          >
            {connecting ? "Conectando…" : "Conectar con Google Drive"}
          </Button>
          {!canConnect && (
            <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
              Faltan las credenciales de Google. Completá{" "}
              <span className="q-mono">core/.env</span> (ver{" "}
              <span className="q-mono">core/.env.example</span>).
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--q-error)" }}>{error}</div>
      )}

      {account && <SyncPanel sync={sync} />}
    </SectionBody>
  );
}

function SyncPanel({ sync }: { sync: SyncController }) {
  const { preview, status, error, progress, check, push, pull, cancel } = sync;
  // Check automático al abrir el panel. Si ya hay una operación corriendo, el
  // guard `busy` del hook lo saltea y el panel muestra el progreso de esa. NO
  // abortamos en el cleanup: en dev StrictMode monta/desmonta/monta, y abortar
  // acá cancelaba este primer check (el segundo queda bloqueado por `busy`),
  // dejándolo colgado en "Revisando…".
  useEffect(() => {
    void check();
  }, [check]);
  const [confirm, setConfirm] = useState<"push" | "pull" | null>(null);
  const busy = status !== "idle" && status !== "error";

  const delta = preview?.delta ?? null;
  const clean = delta ? isClean(delta) : true;
  const changes = delta ? delta.added.length + delta.removed.length + delta.modified.length : 0;

  // Una operación en curso descarta cualquier confirmación pendiente.
  useEffect(() => {
    if (busy) setConfirm(null);
  }, [busy]);

  // Subir borra de la nube los `removed`; bajar borra del local los `added`.
  // Si la dirección borra algo, pedimos confirmar antes (force es destructivo).
  const onSubir = () => (delta && delta.removed.length > 0 ? setConfirm("push") : void push());
  const onBajar = () => (delta && delta.added.length > 0 ? setConfirm("pull") : void pull());

  const summary = !preview
    ? "Revisando cambios…"
    : clean
      ? "Todo sincronizado."
      : `${changes} ${changes === 1 ? "cambio" : "cambios"}`;

  return (
    <div
      style={{
        borderTop: "1px solid var(--q-border)",
        paddingTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--q-text-primary)" }}>
            Sincronizar
          </div>
          {!busy && (
            <div style={{ fontSize: 11, color: "var(--q-text-light)", marginTop: 2 }}>
              {summary}
              {preview?.lastSyncAt ? ` · última sync ${formatRelative(preview.lastSyncAt)}` : ""}
            </div>
          )}
        </div>
        {busy ? (
          <Button variant="destructive" icon="close" onClick={cancel} style={{ flex: "0 0 auto" }}>
            Cancelar
          </Button>
        ) : confirm ? null : (
          <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
            <Button variant="outlined" icon="cloud_upload" disabled={clean} onClick={onSubir}>
              Subir
            </Button>
            <Button variant="outlined" icon="cloud_download" disabled={clean} onClick={onBajar}>
              Bajar
            </Button>
          </div>
        )}
      </div>

      {busy && <SyncProgressBar status={status} progress={progress} />}

      {!busy && !confirm && delta && !clean && <DiffList delta={delta} />}

      {!busy && confirm === "push" && (
        <ConfirmBar
          text={`Subir mandará ${delta!.removed.length} archivo(s) a la papelera de Drive y dejará la nube igual a tu PC.`}
          confirmLabel="Subir igual"
          onConfirm={() => {
            setConfirm(null);
            void push();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {!busy && confirm === "pull" && (
        <ConfirmBar
          text={`Bajar borrará ${delta!.added.length} archivo(s) de tu PC y dejará tu PC igual a la nube.`}
          confirmLabel="Bajar igual"
          onConfirm={() => {
            setConfirm(null);
            void pull();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {!busy && !confirm && !clean && (
        <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
          Subir reemplaza la nube con tu PC · Bajar reemplaza tu PC con la nube.
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: "var(--q-error)" }}>{error}</div>}
    </div>
  );
}


/** Glifo + color por tipo de cambio (perspectiva local, estilo `git status`). */
const DIFF_GLYPH: Record<keyof SyncDelta, { ch: string; color: string }> = {
  added: { ch: "+", color: "#3fb950" },
  modified: { ch: "●", color: "#d29922" },
  removed: { ch: "−", color: "var(--q-error)" },
};

/** Lista archivo por archivo de las diferencias local↔nube. */
function DiffList({ delta }: { delta: SyncDelta }) {
  const rows: { path: string; kind: keyof SyncDelta }[] = [
    ...delta.added.map((path) => ({ path, kind: "added" as const })),
    ...delta.modified.map((path) => ({ path, kind: "modified" as const })),
    ...delta.removed.map((path) => ({ path, kind: "removed" as const })),
  ];
  return (
    <div
      style={{
        maxHeight: 180,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        border: "1px solid var(--q-border)",
        borderRadius: 6,
        padding: "8px 10px",
      }}
    >
      {rows.map(({ path, kind }) => {
        const g = DIFF_GLYPH[kind];
        return (
          <div key={path} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ color: g.color, fontWeight: 700, width: 10, textAlign: "center", flex: "0 0 auto" }}>
              {g.ch}
            </span>
            <span
              className="q-mono"
              style={{
                color: "var(--q-text-secondary)",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {path}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Barra de confirmación para operaciones destructivas (force). */
function ConfirmBar({
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border-dark)",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--q-text-secondary)", minWidth: 0 }}>{text}</span>
      <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
        <Button variant="text" onClick={onCancel}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function SyncProgressBar({
  status,
  progress,
}: {
  status: SyncOp;
  progress: SyncProgress | null;
}) {
  const verb =
    progress?.phase === "scanning"
      ? "Revisando"
      : status === "pushing"
        ? "Subiendo"
        : status === "pulling"
          ? "Bajando"
          : "Procesando";
  const count = progress && progress.total > 0 ? ` ${progress.done} / ${progress.total}` : "";
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const indeterminate = !progress || progress.total === 0;

  return (
    <ProgressBar
      value={pct / 100}
      indeterminate={indeterminate}
      label={`${verb}${count}`}
      detail={progress?.current}
    />
  );
}

/** Tiempo relativo en español, granularidad gruesa (suficiente para "última sync"). */
function formatRelative(epochMs: number): string {
  const secs = Math.round((Date.now() - epochMs) / 1000);
  if (secs < 60) return "hace instantes";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `hace ${days} d`;
}

/**
 * Panel de actualizaciones: chequea contra el endpoint del updater, muestra
 * el estado y permite instalar. El auto-check ya corrió en el boot — si pintó
 * `available`, acá aparece el banner sin necesidad de tocar "Buscar".
 */
function UpdaterPanel({ updater }: { updater: UpdaterController }) {
  const { status, update, progress, error, check, install, dismiss } = updater;
  const busy = status === "checking" || status === "downloading";

  const checkLabel =
    status === "checking"
      ? "Buscando…"
      : status === "uptodate"
        ? "Estás al día"
        : "Buscar actualizaciones";

  return (
    <div
      style={{
        borderTop: "1px solid var(--q-border)",
        paddingTop: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--q-text-primary)" }}>
            Actualizaciones
          </div>
          <div style={{ fontSize: 11, color: "var(--q-text-light)", marginTop: 2 }}>
            {status === "available" && update
              ? `Nueva versión ${update.version} disponible.`
              : status === "uptodate"
                ? "No hay versiones nuevas."
                : "Chequeo manual contra GitHub Releases."}
          </div>
        </div>
        {status !== "available" && status !== "downloading" && (
          <Button
            variant="outlined"
            icon="refresh"
            disabled={busy}
            onClick={() => void check()}
            style={{ flex: "0 0 auto" }}
          >
            {checkLabel}
          </Button>
        )}
      </div>

      {status === "available" && update && (
        <UpdateAvailable
          update={update}
          onInstall={() => void install()}
          onDismiss={dismiss}
        />
      )}

      {status === "downloading" && <DownloadBar progress={progress} />}

      {error && <div style={{ fontSize: 12, color: "var(--q-error)" }}>{error}</div>}
    </div>
  );
}

function UpdateAvailable({
  update,
  onInstall,
  onDismiss,
}: {
  update: { version: string; currentVersion: string; notes?: string };
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 10,
        borderRadius: 6,
        background: "var(--q-surface-alt)",
        border: "1px solid var(--q-border-dark)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "var(--q-text-secondary)" }}>
            <span className="q-mono">{update.currentVersion}</span> →{" "}
            <span className="q-mono" style={{ color: "var(--q-text-primary)", fontWeight: 600 }}>
              {update.version}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--q-text-light)", marginTop: 2 }}>
            Instalar reiniciará la app.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
          <Button variant="text" onClick={onDismiss}>
            Después
          </Button>
          <Button variant="filled" icon="download" onClick={onInstall}>
            Instalar
          </Button>
        </div>
      </div>
      {update.notes && (
        <div
          style={{
            maxHeight: 140,
            overflow: "auto",
            fontSize: 12,
            color: "var(--q-text-secondary)",
            lineHeight: 1.5,
            padding: "8px 10px",
            background: "var(--q-surface)",
            border: "1px solid var(--q-border)",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {update.notes}
        </div>
      )}
    </div>
  );
}

function DownloadBar({
  progress,
}: {
  progress: { downloaded: number; total: number | null } | null;
}) {
  const pct =
    progress && progress.total && progress.total > 0
      ? Math.round((progress.downloaded / progress.total) * 100)
      : 0;
  const indeterminate = !progress?.total || progress.total === 0;
  const human = progress ? formatBytes(progress.downloaded) : "";
  const totalHuman = progress?.total ? ` / ${formatBytes(progress.total)}` : "";

  return (
    <ProgressBar
      value={pct / 100}
      indeterminate={indeterminate}
      label={`Descargando${indeterminate ? "" : ` ${pct}%`}`}
      detail={
        <span className="q-mono">
          {human}
          {totalHuman}
        </span>
      }
    />
  );
}

/** Bytes → texto legible (hasta TB). */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function SectionBody({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {children}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--q-text-primary)" }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: "var(--q-text-light)", marginTop: 2 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
