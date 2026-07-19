import { useCallback, useRef, useState } from "react";
import {
  connect as connectAccount,
  disconnect as disconnectAccount,
} from "../../services/account/account";
import { report } from "../../services/log";
import type {
  AccountInfo,
  AccountStatus,
  ProviderId,
} from "../../services/account/types";

export interface AccountController {
  account: AccountInfo | null;
  status: AccountStatus;
  error: string | null;
  connect: (providerId?: ProviderId) => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Estado de la cuenta conectada. El valor inicial llega cargado desde disco por
 * el bootstrap (ver `App.tsx`). Un ref `busy` evita disparar dos flujos en
 * paralelo (p. ej. doble click en "Conectar").
 */
export function useAccount(initial: AccountInfo | null): AccountController {
  const [account, setAccount] = useState<AccountInfo | null>(initial);
  const [status, setStatus] = useState<AccountStatus>(
    initial ? "connected" : "disconnected",
  );
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const connect = useCallback(async (providerId?: ProviderId) => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setStatus("connecting");
    try {
      const info = await connectAccount(providerId);
      setAccount(info);
      setStatus("connected");
    } catch (e) {
      report("account.connect", e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await disconnectAccount();
      setAccount(null);
      setStatus("disconnected");
    } catch (e) {
      report("account.disconnect", e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, []);

  return { account, status, error, connect, disconnect };
}
