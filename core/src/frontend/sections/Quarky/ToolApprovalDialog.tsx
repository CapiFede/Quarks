/**
 * Diálogo de aprobación para tools mutantes (write_file, edit_file). Aparece
 * inline sobre el panel cuando el agent loop pide aprobación; el loop está
 * pausado esperando la decisión.
 *
 * Tres acciones:
 *   - Aprobar: la tool se ejecuta.
 *   - Rechazar: se le manda al modelo un `tool_result` con error; el modelo
 *     puede decidir si replanteás o termina.
 *   - Feedback: el usuario escribe una instrucción y el agente continúa con
 *     ese mensaje en la cola (cierra el tool_call con un stub y arranca un
 *     nuevo turno).
 */
import { useState } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";

export function ToolApprovalDialog() {
  const { pendingApproval, respondApproval } = useQuarky();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  if (!pendingApproval) return null;

  const approve = () => {
    setFeedbackOpen(false);
    setFeedback("");
    respondApproval({ kind: "approve" });
  };
  const reject = () => {
    setFeedbackOpen(false);
    setFeedback("");
    respondApproval({ kind: "reject" });
  };
  const sendFeedback = () => {
    const message = feedback.trim();
    if (!message) return;
    setFeedbackOpen(false);
    setFeedback("");
    respondApproval({ kind: "feedback", message });
  };

  const argsPretty = JSON.stringify(pendingApproval.args, null, 2);

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "absolute",
        left: 10,
        right: 10,
        bottom: 10,
        background: "var(--q-surface)",
        border: "1px solid var(--q-primary-light)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,.32)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        zIndex: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="security" size={16} color="var(--q-primary-light)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "var(--q-fs-12)",
              fontWeight: "var(--q-fw-semibold)",
              color: "var(--q-text-primary)",
            }}
          >
            Quarky quiere ejecutar <span className="q-mono">{pendingApproval.name}</span>
          </div>
          <div style={{ fontSize: "var(--q-fs-10)", color: "var(--q-text-light)" }}>
            Revisá los argumentos antes de aprobar.
          </div>
        </div>
      </div>

      <pre
        className="q-mono"
        style={{
          margin: 0,
          padding: "8px 10px",
          background: "var(--q-background)",
          border: "1px solid var(--q-border-dark)",
          borderRadius: 6,
          fontSize: "var(--q-fs-11)",
          color: "var(--q-text-secondary)",
          lineHeight: "var(--q-lh-snug)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 200,
          overflow: "auto",
        }}
      >
        {argsPretty}
      </pre>

      {feedbackOpen ? (
        <>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Decile al agente qué hacer distinto…"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 10,
              background: "var(--q-surface-alt)",
              border: "1px solid var(--q-border)",
              borderRadius: 6,
              color: "var(--q-text-primary)",
              fontFamily: "var(--q-font-sans)",
              fontSize: "var(--q-fs-12)",
              lineHeight: "var(--q-lh-relaxed)",
              resize: "vertical",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <Button variant="text" onClick={() => setFeedbackOpen(false)}>
              Volver
            </Button>
            <Button
              variant="filled"
              icon="send"
              disabled={!feedback.trim()}
              onClick={sendFeedback}
            >
              Enviar feedback
            </Button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="text" icon="chat" onClick={() => setFeedbackOpen(true)}>
            Feedback
          </Button>
          <Button variant="destructive" icon="block" onClick={reject}>
            Rechazar
          </Button>
          <Button variant="filled" icon="check" onClick={approve}>
            Aprobar
          </Button>
        </div>
      )}
    </div>
  );
}
