import { useEffect, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { TextInput } from "../components/TextInput";
import { Toggle } from "../components/Toggle";
import { Button } from "../components/Button";
import { QuarkySettings } from "./QuarkySettings";
import { type Space, SPACE_COLORS } from "../../services/spaces";
import { isAutostartEnabled, setAutostart } from "../../services/autostart";
import { isAndroid } from "../../services/platform";
import { hasGoogleCredentials } from "../../services/account/config";
import { useSync, type SyncOp } from "../hooks/useSync";
import { useBackup } from "../hooks/useBackup";
import { isClean, type SyncDelta, type SyncProgress } from "../../services/account/sync";
import { BACKUP_FOLDER, type BackupProgress } from "../../services/account/backup";
import type { UpdaterController } from "../hooks/useUpdater";
import type {
  AccountInfo,
  AccountStatus,
  ProviderId,
} from "../../services/account/types";

const APP_VERSION = __APP_VERSION__;

export type SectionId = "general" | "spaces" | "quarky" | "account";

const NAV: { id: SectionId; label: string; icon: string }[] = [
  { id: "general", label: "General", icon: "tune" },
  { id: "spaces", label: "Espacios", icon: "workspaces" },
  { id: "quarky", label: "Quarky", icon: "smart_toy" },
  { id: "account", label: "Cuenta", icon: "account_circle" },
];

export interface SettingsProps {
  open: boolean;
  onClose: () => void;
  /** Si se pasa, al abrir salta directo a esa sección. */
  initialSection?: SectionId;
  /** Spaces y acciones de gestión (la lista vive en settings; ver useSpaces). */
  spaces: Space[];
  activeSpaceId: string;
  /** Cambia el space activo (los chips del header lo invocan). */
  onSelectSpace: (id: string) => void;
  onCreateSpace: (name: string, color: string) => void;
  onRenameSpace: (id: string, patch: { name?: string; color?: string }) => void;
  onDeleteSpace: (id: string) => void;
  account: AccountInfo | null;
  status: AccountStatus;
  error: string | null;
  onConnect: (providerId?: ProviderId) => void;
  onDisconnect: () => void;
  updater: UpdaterController;
}

/** Popup de configuración: nav lateral + secciones. Escape o click afuera cierra. */
export function Settings({
  open,
  onClose,
  initialSection,
  spaces,
  activeSpaceId,
  onSelectSpace,
  onCreateSpace,
  onRenameSpace,
  onDeleteSpace,
  account,
  status,
  error,
  onConnect,
  onDisconnect,
  updater,
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
          width: "min(720px, 92vw)",
          height: "min(560px, 84vh)",
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
              flex: "0 0 auto",
            }}
          >
            Configuración
          </span>
          {/* Selector rápido de space: chips inline (antes vivía como dropdown
              en la titlebar). Click cambia el activo sin cerrar Settings. */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 6,
              minWidth: 0,
              overflowX: "auto",
            }}
          >
            {spaces.map((s) => (
              <HeaderSpaceChip
                key={s.id}
                space={s}
                active={s.id === activeSpaceId}
                onClick={() => onSelectSpace(s.id)}
              />
            ))}
          </div>
          <IconButton name="close" tooltip="Cerrar" onClick={onClose} />
        </header>

        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <nav
            style={{
              flex: "0 0 180px",
              borderRight: "1px solid var(--q-border)",
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {NAV.map((item) => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={section === item.id}
                onClick={() => setSection(item.id)}
              />
            ))}
          </nav>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 20 }}>
            {section === "general" && <GeneralSection updater={updater} />}
            {section === "spaces" && (
              <SpacesSection
                spaces={spaces}
                activeSpaceId={activeSpaceId}
                onCreate={onCreateSpace}
                onRename={onRenameSpace}
                onDelete={onDeleteSpace}
              />
            )}
            {section === "quarky" && <QuarkySettings />}
            {section === "account" && (
              <AccountSection
                account={account}
                status={status}
                error={error}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
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
          hint="Ahí viven settings, spaces y el contenido de cada quark."
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
}: {
  account: AccountInfo | null;
  status: AccountStatus;
  error: string | null;
  onConnect: (providerId?: ProviderId) => void;
  onDisconnect: () => void;
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

      {account && <SyncPanel />}
      {account && <BackupPanel />}
    </SectionBody>
  );
}

function SyncPanel() {
  const { preview, status, error, progress, push, pull, cancel } = useSync();
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

/**
 * Backup manual a Drive: comprime una carpeta cualquiera del disco en un zip y
 * lo sube a una carpeta aparte del Drive, reemplazando al backup anterior.
 *
 * Deliberadamente separado del sync: el sync espeja el árbol de la app de forma
 * incremental y seguido; esto es un volcado completo y pesado, a mano, para
 * migraciones o formateos. Ver `services/account/backup.ts`.
 */
function BackupPanel() {
  const {
    path,
    setPath,
    commitPath,
    browse,
    estimate,
    status,
    progress,
    error,
    notice,
    lastName,
    run,
    cancel,
  } = useBackup();

  const running = status === "running";
  // Sin estimado no hay carpeta legible: no tiene sentido habilitar el botón.
  const canRun = !running && path.trim().length > 0 && !!estimate && estimate.files > 0;

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
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--q-text-primary)" }}>
          Backup
        </div>
        <div style={{ fontSize: 11, color: "var(--q-text-light)", marginTop: 2 }}>
          Comprime una carpeta y la sube a <span className="q-mono">{BACKUP_FOLDER}</span> en
          tu Drive. Reemplaza al backup anterior.
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <TextInput
          value={path}
          onChange={setPath}
          onBlur={commitPath}
          placeholder="/mnt/Other/Backup"
          icon="folder"
          style={{ flex: 1 }}
        />
        <IconButton
          name="folder_open"
          tooltip="Elegir carpeta…"
          onClick={() => void browse()}
        />
      </div>

      {!running && estimate && (
        <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
          {estimate.files.toLocaleString("es")}{" "}
          {estimate.files === 1 ? "archivo" : "archivos"} · {formatBytes(estimate.bytes)} sin
          comprimir
        </div>
      )}

      {running && <BackupProgressBar progress={progress} />}

      <div style={{ display: "flex", gap: 8 }}>
        {running ? (
          <Button variant="destructive" icon="close" onClick={cancel}>
            Cancelar
          </Button>
        ) : (
          <Button variant="outlined" icon="backup" disabled={!canRun} onClick={() => void run()}>
            Hacer backup
          </Button>
        )}
      </div>

      {!running && status === "done" && lastName && (
        <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>
          Subido como <span className="q-mono">{lastName}</span>.
        </div>
      )}
      {!running && notice && (
        <div style={{ fontSize: 11, color: "var(--q-text-light)" }}>{notice}</div>
      )}
      {error && <div style={{ fontSize: 12, color: "var(--q-error)" }}>{error}</div>}
    </div>
  );
}

/**
 * Barra de progreso del backup. Las dos fases largas (comprimir y subir) tienen
 * cada una su propio total, así que la barra se reinicia al pasar de una a otra
 * en lugar de intentar un porcentaje global — el peso del zip no se conoce hasta
 * que termina de comprimirse.
 */
function BackupProgressBar({ progress }: { progress: BackupProgress | null }) {
  let label = "Preparando";
  let detail = "";
  let done = 0;
  let total = 0;

  if (progress?.phase === "scanning") {
    label = "Revisando la carpeta";
  } else if (progress?.phase === "zipping") {
    label = "Comprimiendo";
    detail = progress.file;
    done = progress.done;
    total = progress.total;
  } else if (progress?.phase === "zipped") {
    label = `Comprimido (${formatBytes(progress.bytes)}) — subiendo`;
  } else if (progress?.phase === "uploading") {
    label = "Subiendo a Drive";
    detail = `${formatBytes(progress.sent)} / ${formatBytes(progress.total)}`;
    done = progress.sent;
    total = progress.total;
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const indeterminate = total === 0;
  const count = progress?.phase === "zipping" && total > 0 ? ` ${done} / ${total}` : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
        <span style={{ color: "var(--q-text-secondary)", fontWeight: 500, flex: "0 0 auto" }}>
          {label}
          {count}
        </span>
        {detail && (
          <span
            style={{
              color: "var(--q-text-light)",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {detail}
          </span>
        )}
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 9999,
          background: "var(--q-surface-alt)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: indeterminate ? "100%" : `${pct}%`,
            background: "var(--q-primary)",
            opacity: indeterminate ? 0.4 : 1,
            transition: "width var(--q-dur-fast) var(--q-ease)",
          }}
        />
      </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11 }}>
        <span style={{ color: "var(--q-text-secondary)", fontWeight: 500 }}>
          {verb}
          {count}
        </span>
        {progress?.current && (
          <span
            style={{
              color: "var(--q-text-light)",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {progress.current}
          </span>
        )}
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 9999,
          background: "var(--q-surface-alt)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: indeterminate ? "100%" : `${pct}%`,
            background: "var(--q-primary)",
            opacity: indeterminate ? 0.4 : 1,
            transition: "width var(--q-dur-fast) var(--q-ease)",
          }}
        />
      </div>
    </div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
        <span style={{ color: "var(--q-text-secondary)", fontWeight: 500 }}>
          Descargando{indeterminate ? "" : ` ${pct}%`}
        </span>
        <span style={{ color: "var(--q-text-light)" }} className="q-mono">
          {human}
          {totalHuman}
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 9999,
          background: "var(--q-surface-alt)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: indeterminate ? "100%" : `${pct}%`,
            background: "var(--q-primary)",
            opacity: indeterminate ? 0.4 : 1,
            transition: "width var(--q-dur-fast) var(--q-ease)",
          }}
        />
      </div>
    </div>
  );
}

/** Bytes → texto legible. Llega hasta TB: un backup puede pesar decenas de GB. */
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

// ── Espacios ─────────────────────────────────────────────────────────────────

function SpacesSection({
  spaces,
  activeSpaceId,
  onCreate,
  onRename,
  onDelete,
}: {
  spaces: Space[];
  activeSpaceId: string;
  onCreate: (name: string, color: string) => void;
  onRename: (id: string, patch: { name?: string; color?: string }) => void;
  onDelete: (id: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SPACE_COLORS[0]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name, newColor);
    setNewName("");
    setNewColor(SPACE_COLORS[0]);
  };

  return (
    <SectionBody>
      <p style={{ fontSize: 13, color: "var(--q-text-secondary)", lineHeight: 1.5, margin: 0 }}>
        Los espacios separan tus datos por contexto (Personal, Trabajo…). El espacio
        activo se elige desde el chip de la barra de título.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {spaces.map((s) => (
          <SpaceEditRow
            key={s.id}
            space={s}
            isActive={s.id === activeSpaceId}
            canDelete={spaces.length > 1}
            confirming={confirmId === s.id}
            onName={(name) => onRename(s.id, { name })}
            onColor={(color) => onRename(s.id, { color })}
            onAskDelete={() => setConfirmId(s.id)}
            onCancelDelete={() => setConfirmId(null)}
            onConfirmDelete={() => {
              onDelete(s.id);
              setConfirmId(null);
            }}
          />
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--q-border)",
          paddingTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--q-text-primary)" }}>
          Nuevo espacio
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <TextInput
            value={newName}
            onChange={setNewName}
            placeholder="Nombre del espacio"
            style={{ flex: 1 }}
          />
          <Button variant="filled" icon="add" disabled={!newName.trim()} onClick={add}>
            Agregar
          </Button>
        </div>
        <Swatches value={newColor} onChange={setNewColor} />
      </div>
    </SectionBody>
  );
}

function SpaceEditRow({
  space,
  isActive,
  canDelete,
  confirming,
  onName,
  onColor,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  space: Space;
  isActive: boolean;
  canDelete: boolean;
  confirming: boolean;
  onName: (name: string) => void;
  onColor: (color: string) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
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
        border: "1px solid var(--q-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TextInput
          value={space.name}
          onChange={onName}
          placeholder="Nombre"
          style={{ flex: 1 }}
        />
        {isActive && (
          <span style={{ fontSize: 11, color: "var(--q-text-light)", flex: "0 0 auto" }}>
            activo
          </span>
        )}
        {confirming ? (
          <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
            <Button variant="text" onClick={onCancelDelete}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onConfirmDelete}>
              Borrar
            </Button>
          </div>
        ) : (
          canDelete && (
            <IconButton name="delete" tooltip="Borrar espacio" onClick={onAskDelete} />
          )
        )}
      </div>
      <Swatches value={space.color} onChange={onColor} />
    </div>
  );
}

/** Fila de swatches de `SPACE_COLORS`; el seleccionado lleva anillo. */
function Swatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {SPACE_COLORS.map((c) => {
        const selected = c === value;
        return (
          <span
            key={c}
            onClick={() => onChange(c)}
            title={c}
            style={{
              width: 20,
              height: 20,
              borderRadius: 9999,
              background: c,
              cursor: "default",
              boxShadow: selected
                ? "0 0 0 2px var(--q-surface-alt), 0 0 0 4px var(--q-text-primary)"
                : "none",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Helpers de layout ────────────────────────────────────────────────────────

function SectionBody({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {children}
    </div>
  );
}

/** Aplica alpha hex a un color hex de 6 dígitos; si no lo es, lo deja tal cual. */
function tint(color: string, alphaHex: string): string {
  return color.startsWith("#") && color.length === 7 ? `${color}${alphaHex}` : color;
}

/**
 * Chip de space en el header de Settings: selector rápido del activo. El
 * activo lleva fondo lleno con el color del space; los demás van sutiles y
 * se realzan al hover. Click cambia el activo sin cerrar Settings.
 */
function HeaderSpaceChip({
  space,
  active,
  onClick,
}: {
  space: Space;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const bg = active
    ? tint(space.color, "33")
    : hover
      ? tint(space.color, "1f")
      : "transparent";
  const border = active ? tint(space.color, "70") : tint(space.color, "40");
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      title={space.name}
      style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 24,
        padding: "0 10px",
        borderRadius: 9999,
        background: bg,
        border: `1px solid ${border}`,
        color: active ? "var(--q-text-primary)" : "var(--q-text-secondary)",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: "default",
        whiteSpace: "nowrap",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 9999,
          background: space.color,
          flex: "0 0 auto",
        }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 140 }}>
        {space.name}
      </span>
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
