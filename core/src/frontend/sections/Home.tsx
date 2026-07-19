import { useState } from "react";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { Button } from "../components/Button";
import { QUARK_STUBS } from "../../quark/registry";
import type { AccountInfo } from "../../services/account/types";

export interface HomeProps {
  /** Nombre que se muestra en el strip de usuario cuando no hay cuenta. */
  displayName: string;
  /** Cuenta conectada, o `null` si no hay sesión. */
  account: AccountInfo | null;
  onOpen: (id: string) => void;
  onSettings?: () => void;
  /** Abre Settings en la sección Cuenta para iniciar sesión. */
  onLogin?: () => void;
}

/** Launcher: grilla de accesos a los quarks + strip de usuario abajo. */
export function Home({ displayName, account, onOpen, onSettings, onLogin }: HomeProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "18px 20px 14px",
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {QUARK_STUBS.map((q) => (
            <Shortcut
              key={q.id}
              icon={q.icon}
              label={q.name}
              onClick={() => onOpen(q.id)}
            />
          ))}
        </div>
      </div>

      <UserStrip
        displayName={displayName}
        account={account}
        onSettings={onSettings}
        onLogin={onLogin}
      />
    </div>
  );
}

interface ShortcutProps {
  icon: string;
  label: string;
  onClick: () => void;
}

function Shortcut({ icon, label, onClick }: ShortcutProps) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 92,
        padding: "10px 4px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        borderRadius: 4,
        background: hover ? "rgba(255,255,255,.07)" : "transparent",
        cursor: "default",
        transition: "background var(--q-dur-fast) var(--q-ease)",
      }}
    >
      <Icon name={icon} size={29} color="var(--q-primary)" />
      <span
        style={{
          marginTop: 6,
          fontSize: 12,
          fontWeight: 500,
          color: "var(--q-text-secondary)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

function UserStrip({
  displayName,
  account,
  onSettings,
  onLogin,
}: {
  displayName: string;
  account: AccountInfo | null;
  onSettings?: () => void;
  onLogin?: () => void;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--q-border)",
        paddingTop: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9999,
          background: "var(--q-primary)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="person" size={17} color="#fff" />
      </div>
      {account ? (
        <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--q-text-primary)" }}>
            {account.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--q-text-secondary)" }}>
            {account.email}
          </div>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--q-text-primary)" }}>
              {displayName || "Invitado"}
            </div>
          </div>
          <Button variant="text" icon="login" onClick={onLogin}>
            Iniciar sesión
          </Button>
        </>
      )}
      <IconButton name="settings" tooltip="Configuración" onClick={onSettings} />
    </div>
  );
}
