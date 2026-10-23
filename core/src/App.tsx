import { useEffect, useState } from "react";
import { WindowFrame } from "./frontend/sections/WindowFrame";
import { Shell } from "./frontend/sections/Shell";
import { loadAppState, type AppState } from "./services/appState";
import { loadSettings, type AppSettings } from "./services/settings";
import { loadAccount } from "./services/account/account";
import type { AccountInfo } from "./services/account/types";
import { ensureLayout } from "./services/bootstrap";
import { migrateSpacesIfNeeded } from "./services/legacySpaces";
import { report, withScope } from "./services/log";

interface Boot {
  appState: AppState;
  settings: AppSettings;
  account: AccountInfo | null;
}

/** Carga el estado persistido desde disco y luego monta el shell. */
export function App() {
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootError, setBootError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;
    void withScope("bootstrap", async () => {
      // La migración desde los Spaces va antes que todo: reescribe settings.json
      // y arma la data que después leen los quarks (ver `legacySpaces.ts`).
      await migrateSpacesIfNeeded();
      const settings = await loadSettings();
      await ensureLayout();
      const [appState, account] = await Promise.all([loadAppState(), loadAccount()]);
      if (alive) setBoot({ appState, settings, account });
    }).catch((e: unknown) => {
      // Lo capturamos para mostrar el fallback, así que lo reportamos a mano
      // (de otro modo no llegaría al handler global ni al popup).
      report(e);
      if (alive) setBootError(e);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Fallback si el arranque falló: no dejar la ventana colgada en blanco.
  if (bootError) {
    return (
      <WindowFrame>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--q-space-12)",
            textAlign: "center",
            fontSize: "var(--q-fs-12)",
            color: "var(--q-error)",
          }}
        >
          No se pudo cargar la app. Revisá la consola o el detalle del error.
        </div>
      </WindowFrame>
    );
  }

  // Marco vacío mientras se cargan los datos (parpadeo mínimo al arrancar).
  if (!boot) return <WindowFrame>{null}</WindowFrame>;

  return (
    <Shell
      initialAppState={boot.appState}
      initialSettings={boot.settings}
      initialAccount={boot.account}
    />
  );
}
