/**
 * Tab System (CachyOS). Maneja el repo de dotfiles en `~/.dotfiles`:
 *
 *   - Crear snapshot  → captura paquetes + configs y los pushea a git.
 *   - Aplicar cambios → remueve los paquetes de remove.txt (root, vía pkexec) y
 *                       aplica los overrides de hide.txt (usuario). Idempotente.
 *   - Editar listas   → abre remove.txt / hide.txt en el editor por defecto.
 *
 * La lógica vive en los scripts del repo (`services/snapshot.ts` solo arma los
 * comandos que los invocan). Restaurar en una PC nueva es por consola:
 * `git clone <repo> ~/.dotfiles && bash ~/.dotfiles/restore.sh`.
 *
 * Mientras un script corre, `busy` deshabilita los botones y mostramos la salida
 * en vivo en el panel de log.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@quarks/core";
import { runScript } from "../services/system";
import {
  dotfilesPaths,
  snapshotScript,
  applyRemoveScript,
  applyHideScript,
  openFileScript,
  type DotfilesPaths,
} from "../services/snapshot";

export function SystemView() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const pathsRef = useRef<DotfilesPaths | null>(null);

  // Auto-scroll del log al fondo cuando llegan líneas nuevas.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const appendLog = (line: string) => setLog((prev) => [...prev, line]);

  // Resuelve (y cachea) las rutas absolutas del repo.
  async function paths(): Promise<DotfilesPaths> {
    if (!pathsRef.current) pathsRef.current = await dotfilesPaths();
    return pathsRef.current;
  }

  async function doSnapshot() {
    setBusy(true);
    appendLog("$ Crear snapshot");
    try {
      const p = await paths();
      const code = await runScript("snapshot", snapshotScript(p), false, appendLog);
      appendLog(code === 0 ? "✓ Snapshot listo." : `✗ Terminó con código ${code}.`);
    } catch (e) {
      appendLog(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function doApply() {
    setBusy(true);
    appendLog("$ Aplicar cambios (remover + ocultar)");
    try {
      const p = await paths();
      appendLog("· Removiendo paquetes (puede pedir tu contraseña)…");
      const c1 = await runScript("apply-remove", applyRemoveScript(p), true, appendLog);
      appendLog("· Aplicando ocultar…");
      const c2 = await runScript("apply-hide", applyHideScript(p), false, appendLog);
      appendLog(c1 === 0 && c2 === 0 ? "✓ Cambios aplicados." : `✗ Terminó con código ${c1 || c2}.`);
    } catch (e) {
      appendLog(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openList(which: "remove" | "hide") {
    try {
      const p = await paths();
      const path = which === "remove" ? p.removeTxt : p.hideTxt;
      appendLog(`$ Abrir ${which === "remove" ? "remove.txt" : "hide.txt"}`);
      await runScript("open-file", openFileScript(path), false, appendLog);
    } catch (e) {
      appendLog(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="q-utils-stack q-sys">
      <h2 className="q-utils-title">System</h2>

      <div className="q-utils-hint">
        <Icon name="info" size={14} />
        El estado del sistema vive en <code>~/.dotfiles</code> (repo git). El
        snapshot lo captura y sube; aplicar ejecuta las listas de remover/ocultar.
      </div>

      <div className="q-utils-row">
        <Button variant="filled" icon="cloud_upload" disabled={busy} onClick={doSnapshot}>
          Crear snapshot
        </Button>
        <Button variant="soft" icon="published_with_changes" disabled={busy} onClick={doApply}>
          Aplicar cambios
        </Button>
        {busy && <Icon name="progress_activity" size={16} className="q-sys-spin" />}
      </div>

      <div className="q-utils-row">
        <Button variant="outlined" icon="delete" disabled={busy} onClick={() => openList("remove")}>
          Paquetes a remover
        </Button>
        <Button variant="outlined" icon="visibility_off" disabled={busy} onClick={() => openList("hide")}>
          Apps a ocultar
        </Button>
      </div>

      <div className="q-sys-notes">
        <div className="q-sys-note">
          <Icon name="published_with_changes" size={14} />
          <div>
            <strong>Aplicar</strong> es seguro de repetir: remueve lo de{" "}
            <code>remove.txt</code> y oculta lo de <code>hide.txt</code>. Editá la
            lista, tocá Aplicar.
          </div>
        </div>
        <div className="q-sys-note">
          <Icon name="restore" size={14} />
          <div>
            <strong>Restaurar en una PC nueva</strong> (reinstala paquetes + config + tweaks):
            <code className="q-sys-cmd">
              git clone https://github.com/CapiFede/catchyos ~/.dotfiles && bash ~/.dotfiles/restore.sh
            </code>
          </div>
        </div>
      </div>

      {log.length > 0 && (
        <div className="q-sys-section">
          <div className="q-utils-section-title">
            <span>Salida</span>
            <span className="q-sys-log-actions">
              <button className="q-sys-clear" disabled={busy} onClick={() => setLog([])}>
                Limpiar
              </button>
            </span>
          </div>
          <div className="q-sys-log" ref={logRef}>
            {log.map((line, i) => (
              <div key={i} className="q-sys-log-line">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
