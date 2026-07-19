/**
 * Lista de mensajes del chat. Render minimalista para M1: bloques user/assistant
 * con un caption de rol, contenido en texto plano. Markdown, tool_use blocks y
 * scroll-on-streaming llegan en M2/M3.
 *
 * Empty state: si no hay conversación activa, mostramos un hint para que el
 * usuario sepa qué hacer (mandar un mensaje crea automáticamente la conversación
 * en `sendMessage`, pero el botón "+" también la crea explícitamente).
 */
import { useEffect, useRef } from "react";
import { useQuarky } from "../../../quarky/hooks/useQuarky";
import { Icon } from "../../components/Icon";
import { Button } from "../../components/Button";
import { Markdown } from "./Markdown";
import type { Message } from "../../../quarky/types";

export function MessageList() {
  const { active, status, error, apiKeyConfigured, openSettings } = useQuarky();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Scroll al final cuando entra un mensaje nuevo o termina el envío.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [active?.messages.length, status]);

  // Empty state: hay tres variantes que se chequean en este orden.
  if (!active || active.messages.length === 0) {
    // 1. API key sin configurar — bloquea todo lo demás. Hasta que la cargue,
    //    nada del panel sirve, así que el mensaje y la acción son explícitos.
    if (apiKeyConfigured === false) {
      return (
        <EmptyState
          icon="key_off"
          title="Configurá Quarky"
          body="Necesitás una API key de OpenRouter para empezar a chatear."
          action={
            <Button variant="filled" icon="settings" onClick={openSettings}>
              Abrir Settings
            </Button>
          }
        />
      );
    }
    // 2. Estamos chequeando el keyring — no decimos nada concreto todavía.
    if (apiKeyConfigured === null) {
      return <EmptyState icon="smart_toy" body="Cargando…" />;
    }
    // 3. Listo para usar — invitación a tipear.
    return (
      <EmptyState
        icon="smart_toy"
        body="Escribí abajo para empezar. Las conversaciones se guardan por espacio."
      />
    );
  }

  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {active.messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
      {status === "sending" && <Thinking />}
      {status === "error" && error && <ErrorRow text={error} />}
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  // Tool result: mensaje del role:tool, lo renderizamos como bloque pequeño
  // colapsable adentro del flow del assistant.
  if (isTool) {
    return <ToolResultBlock name={message.name ?? "tool"} content={message.content} />;
  }

  // Si el assistant solo invocó tools sin texto, mostramos los chips de los
  // tool calls; si trajo texto Y tool_calls, mostramos ambos en orden lógico.
  const hasContent = message.content.trim().length > 0;
  const hasCalls = message.toolCalls && message.toolCalls.length > 0;
  const images = message.images ?? [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        alignSelf: isUser ? "flex-end" : "flex-start",
        maxWidth: "85%",
        width: hasCalls && !isUser ? "100%" : undefined,
      }}
    >
      <div
        style={{
          fontSize: "var(--q-fs-10)",
          color: "var(--q-text-light)",
          textTransform: "uppercase",
          letterSpacing: "var(--q-ls-caps)",
        }}
      >
        {isUser ? "Vos" : "Quarky"}
      </div>
      {images.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: isUser ? "flex-end" : "flex-start",
          }}
        >
          {images.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`adjunto ${i + 1}`}
              style={{
                maxWidth: 180,
                maxHeight: 180,
                borderRadius: 8,
                border: "1px solid var(--q-border)",
                objectFit: "cover",
              }}
            />
          ))}
        </div>
      )}
      {hasContent && (
        <div
          className="q-selectable"
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            background: isUser ? "var(--q-primary-soft)" : "var(--q-surface-alt)",
            color: "var(--q-text-primary)",
            fontSize: "var(--q-fs-13)",
            lineHeight: "var(--q-lh-relaxed)",
            // El usuario tipeó texto plano: preservamos saltos/espacios. El
            // asistente viene en Markdown y `<Markdown>` maneja su propio layout.
            ...(isUser
              ? { whiteSpace: "pre-wrap", wordBreak: "break-word" }
              : null),
          }}
        >
          {isUser ? message.content : <Markdown>{message.content}</Markdown>}
        </div>
      )}
      {hasCalls && message.toolCalls!.map((c) => <ToolCallBlock key={c.id} call={c} />)}
    </div>
  );
}

function ToolCallBlock({
  call,
}: {
  call: NonNullable<Message["toolCalls"]>[number];
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        background: "var(--q-surface-alt)",
        border: "1px dashed var(--q-border-light)",
        color: "var(--q-text-secondary)",
        fontSize: "var(--q-fs-11)",
        alignSelf: "flex-start",
        maxWidth: "100%",
        minWidth: 0,
      }}
      title={call.function.arguments}
    >
      <Icon name="play_arrow" size={12} />
      <span className="q-mono">{call.function.name}</span>
    </div>
  );
}

function ToolResultBlock({ name, content }: { name: string; content: string }) {
  const isError = /^[a-zA-Z_]+\s*(:|falló)/.test(content) && /error|no existe|rechazó/i.test(content);
  return (
    <details
      style={{
        alignSelf: "flex-start",
        maxWidth: "100%",
        background: isError ? "rgba(227,181,181,0.06)" : "var(--q-background)",
        border: `1px solid ${isError ? "var(--q-error)" : "var(--q-border)"}`,
        borderRadius: 8,
        padding: "4px 8px",
        fontSize: "var(--q-fs-11)",
        color: "var(--q-text-secondary)",
      }}
    >
      <summary
        style={{
          cursor: "default",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: isError ? "var(--q-error)" : "var(--q-text-secondary)",
          listStyle: "none",
        }}
      >
        <Icon name={isError ? "error" : "check_circle"} size={12} />
        <span className="q-mono">{name}</span>
        <span style={{ color: "var(--q-text-light)", marginLeft: 4 }}>
          · {previewLine(content)}
        </span>
      </summary>
      <pre
        className="q-mono q-selectable"
        style={{
          margin: "6px 0 0",
          padding: 8,
          background: "var(--q-background)",
          border: "1px solid var(--q-border-dark)",
          borderRadius: 6,
          fontSize: "var(--q-fs-10)",
          color: "var(--q-text-light)",
          lineHeight: "var(--q-lh-snug)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 240,
          overflow: "auto",
        }}
      >
        {content}
      </pre>
    </details>
  );
}

/** Primera línea no vacía, truncada para el header colapsable. */
function previewLine(s: string): string {
  for (const line of s.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) return trimmed.slice(0, 80);
  }
  return "";
}

function Thinking() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 10,
        background: "var(--q-surface-alt)",
        color: "var(--q-text-light)",
        fontSize: "var(--q-fs-12)",
      }}
    >
      <Icon name="more_horiz" size={16} />
      Pensando…
    </div>
  );
}

function ErrorRow({ text }: { text: string }) {
  return (
    <div
      style={{
        alignSelf: "stretch",
        padding: "8px 12px",
        borderRadius: 8,
        background: "rgba(227, 181, 181, 0.08)",
        border: "1px solid var(--q-error)",
        color: "var(--q-error)",
        fontSize: "var(--q-fs-12)",
      }}
    >
      {text}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title?: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 20,
        textAlign: "center",
      }}
    >
      <Icon name={icon} size={40} color="var(--q-text-light)" />
      {title && (
        <div
          style={{
            fontSize: "var(--q-fs-15)",
            fontWeight: "var(--q-fw-semibold)",
            color: "var(--q-text-secondary)",
          }}
        >
          {title}
        </div>
      )}
      <div
        style={{
          fontSize: "var(--q-fs-13)",
          maxWidth: 280,
          lineHeight: 1.5,
          color: "var(--q-text-light)",
        }}
      >
        {body}
      </div>
      {action}
    </div>
  );
}
