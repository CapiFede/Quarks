/**
 * Generador de título corto para conversaciones nuevas.
 *
 * Se invoca DESPUÉS del primer turno (user + assistant) cuando el título
 * sigue siendo "Sin título". Hace una llamada chica al provider con un system
 * dedicado y los dos primeros mensajes; pide 3-5 palabras, sin comillas, sin
 * punto final.
 *
 * Aporta un overhead chico (~50 tokens de input + 10 de output) por conversación.
 * Lo dejamos opt-in via `QuarkyConfig.autoRename` para no cobrarle a quien no
 * lo quiera.
 */
import { chatCompletion } from "./provider";
import { newConversation } from "./conversation";

const SYSTEM = `Generá un título corto (3 a 5 palabras) que resuma esta conversación.
Solo devolvé el título. Sin comillas, sin punto final, sin emojis.`;

export async function generateTitle(args: {
  model: string;
  userText: string;
  assistantText: string;
}): Promise<string | null> {
  // Conversación sintética con los dos turnos. Reusa el shape de Conversation
  // para no duplicar la serialización del wire format.
  const stub = newConversation("__autoRename__", "ask");
  stub.messages = [
    {
      id: "u",
      role: "user",
      content: args.userText,
      createdAt: Date.now(),
    },
    {
      id: "a",
      role: "assistant",
      content: args.assistantText,
      createdAt: Date.now(),
    },
  ];

  try {
    const r = await chatCompletion({
      systemPrompt: SYSTEM,
      conversation: stub,
      model: args.model,
    });
    return cleanTitle(r.content);
  } catch {
    // Falla silenciosa: la conversación se queda con "Sin título" y el usuario
    // la puede renombrar a mano. No es crítico.
    return null;
  }
}

/** Limpia el título devuelto por el modelo (quita comillas y puntuación final). */
function cleanTitle(raw: string): string | null {
  let t = raw.trim();
  // Sacar comillas de cualquier tipo.
  t = t.replace(/^["'`«»"']+|["'`«»"']+$/g, "");
  // Sacar punto/etc finales.
  t = t.replace(/[.!?,;:]+$/g, "");
  // Si vino algo enorme (el modelo no respetó el límite), recortamos.
  if (t.length > 60) t = t.slice(0, 60).replace(/\s+\S*$/, "");
  return t.length > 0 ? t : null;
}
