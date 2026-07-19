/**
 * `propose_chapter_rewrite`: abre una vista comparativa en el quark Libros con
 * una propuesta de reescritura completa del capítulo abierto.
 *
 * NO escribe nada a disco. Solo publica al bus `proposals.ts`; el books quark
 * lo consume y abre el split (capítulo actual a la izquierda, propuesta a la
 * derecha). El usuario decide con tres botones de la UI: rechazar, reemplazar
 * (pisa el capítulo abierto) o aceptar (crea un capítulo nuevo).
 *
 * Por eso NO requiere aprobación inline: abrir un diff es inocuo. La aprobación
 * real es el botón que el usuario tocá en el split. Disponible en Ask y Agent
 * por igual: el riesgo cero está en lo que la tool hace (publicar a memoria).
 *
 * La tool no recibe ids de libro/capítulo: opera sobre el capítulo que esté
 * abierto cuando el usuario apruebe en la UI. Si no hay nada abierto, el books
 * quark ignora silenciosamente.
 */
import { publishBookProposal } from "../../proposals";
import type { ToolDef } from "../types";

interface Args {
  content: string;
  summary?: string;
  title?: string;
}

export const proposeChapterRewrite: ToolDef = {
  availableInAsk: true,
  requiresApproval: false,
  schema: {
    type: "function",
    function: {
      name: "propose_chapter_rewrite",
      description:
        "Propone una REESCRITURA COMPLETA del capítulo de Libros abierto. " +
        "Abre una vista comparativa en el editor con el original a la izquierda y tu propuesta a la derecha; " +
        "el usuario decide con tres botones (rechazar, reemplazar el capítulo actual, o aceptar como capítulo nuevo). " +
        "REGLAS ESTRICTAS DE USO:\n" +
        "  • Usala SOLO cuando estés reestructurando el capítulo entero: reordenar escenas, refundir párrafos, cambio mayor de tono o de POV. " +
        "  • NO la uses para sugerencias menores a una página: edits de una oración, fix de un párrafo, propuesta de un nuevo título, recomendaciones de estilo puntuales. Esos cambios van explicados en chat.\n" +
        "  • Solo está disponible cuando el usuario tiene un capítulo de Libros abierto. " +
        "  • `content` debe ser el capítulo COMPLETO en markdown, no un diff ni un snippet.",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "El capítulo reescrito completo, en markdown.",
          },
          summary: {
            type: "string",
            description:
              "Resumen breve (1-2 oraciones) de qué cambiaste y por qué. Se muestra arriba del panel derecho.",
          },
          title: {
            type: "string",
            description:
              "Título sugerido para el capítulo si el usuario elige 'Aceptar' (crear nuevo). Default: título actual + ' (propuesta)'.",
          },
        },
        required: ["content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs) {
    const args = rawArgs as Args;
    const content = typeof args.content === "string" ? args.content : "";
    if (!content.trim()) {
      return {
        content:
          "propose_chapter_rewrite: `content` viene vacío. Mandá el capítulo reescrito completo en markdown.",
        isError: true,
      };
    }
    publishBookProposal({
      content,
      summary: typeof args.summary === "string" ? args.summary : null,
      suggestedTitle: typeof args.title === "string" ? args.title : null,
    });
    return {
      content:
        "Propuesta abierta en el editor. El usuario la está revisando y decidirá si la rechaza, la usa para reemplazar el capítulo, o la acepta como capítulo nuevo. No vuelvas a llamar a esta tool hasta que el usuario responda.",
    };
  },
};
