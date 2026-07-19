/**
 * `manage_memory`: CRUD sobre el store de memoria desde el modelo.
 *
 * Acciones:
 *   - `list`                                       lista entradas con id+category+preview
 *   - `read({id})`                                 contenido completo de una entrada
 *   - `write({text, category?})`                   crea entrada nueva (devuelve el id)
 *   - `update({id, text?, category?, pinned?})`    edita una existente
 *   - `delete({id})`                               la borra
 *   - `pin({id})` / `unpin({id})`                  shortcuts para flippear `pinned`
 *
 * Disponible en Ask Y en Agent: la memoria es una vidriera del usuario, conviene
 * que esté siempre a mano. `write`/`update`/`delete`/`pin`/`unpin` NO piden
 * aprobación — el alcance es `quarky/memory.json`, no toca archivos del usuario.
 *
 * Nota: en M1 todas las entradas se inyectan siempre (haya `pinned` o no). El
 * flag se respeta y se persiste para que cuando aterrice el retrieval (M2), las
 * pinneadas existentes ya estén marcadas correctamente.
 */
import {
  addEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from "../../memory/store";
import { MEMORY_CATEGORIES, type MemoryCategory } from "../../memory/types";
import type { ToolDef } from "../types";

type Action = "list" | "read" | "write" | "update" | "delete" | "pin" | "unpin";

interface Args {
  action: Action;
  id?: string;
  text?: string;
  category?: MemoryCategory;
  pinned?: boolean;
}

export const manageMemory: ToolDef = {
  availableInAsk: true,
  schema: {
    type: "function",
    function: {
      name: "manage_memory",
      description:
        "Lee, lista, crea, edita, borra y pinea/despinea entradas de tu memoria persistente (`quarky/memory.json`). Usá `write` para recordar algo nuevo durable que el usuario dijo. Usá `list` para ver qué recordás antes de duplicar. Las entradas `identity` se autopinean.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "read", "write", "update", "delete", "pin", "unpin"],
          },
          id: { type: "string", description: "Id de la entrada. Requerido para read/update/delete/pin/unpin." },
          text: { type: "string", description: "Contenido. Requerido para `write`; opcional para `update`." },
          category: {
            type: "string",
            enum: [...MEMORY_CATEGORIES],
            description:
              "Categoría. Default: `fact`. Usá `identity` para datos personales fijos (nombre, ubicación), `preference` para gustos, `project` para iniciativas en curso, `task` para pendientes.",
          },
          pinned: {
            type: "boolean",
            description: "Solo para `update`: forzar pinned on/off. Para flippear simple, usá las acciones `pin`/`unpin`.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs) {
    const { action, id, text, category, pinned } = rawArgs as Args;
    switch (action) {
      case "list": {
        const list = await listEntries();
        if (list.length === 0) return { content: "manage_memory.list: sin entradas." };
        return {
          content: list
            .map((e) => {
              const preview = e.text.split("\n")[0].slice(0, 80);
              const flags = e.pinned ? " [pinned]" : "";
              return `- ${e.id} · ${e.category}${flags}: ${preview}`;
            })
            .join("\n"),
        };
      }
      case "read": {
        if (!id) return { content: "manage_memory.read: falta `id`.", isError: true };
        const e = await getEntry(id);
        if (!e) return { content: `manage_memory.read: no existe \`${id}\``, isError: true };
        const flags = e.pinned ? " (pinned)" : "";
        return { content: `# ${e.category}${flags}\n${e.text}` };
      }
      case "write": {
        if (!text) return { content: "manage_memory.write: falta `text`.", isError: true };
        const e = await addEntry({ text, category });
        return { content: `manage_memory.write: guardé \`${e.id}\` (${e.category}${e.pinned ? ", pinned" : ""}).` };
      }
      case "update": {
        if (!id) return { content: "manage_memory.update: falta `id`.", isError: true };
        if (text === undefined && category === undefined && pinned === undefined) {
          return { content: "manage_memory.update: no hay cambios.", isError: true };
        }
        const e = await updateEntry(id, { text, category, pinned });
        if (!e) return { content: `manage_memory.update: no existe \`${id}\``, isError: true };
        return { content: `manage_memory.update: actualicé \`${e.id}\`.` };
      }
      case "delete": {
        if (!id) return { content: "manage_memory.delete: falta `id`.", isError: true };
        const ok = await deleteEntry(id);
        return ok
          ? { content: `manage_memory.delete: borré \`${id}\`.` }
          : { content: `manage_memory.delete: no existe \`${id}\``, isError: true };
      }
      case "pin":
      case "unpin": {
        if (!id) return { content: `manage_memory.${action}: falta \`id\`.`, isError: true };
        const e = await updateEntry(id, { pinned: action === "pin" });
        if (!e) return { content: `manage_memory.${action}: no existe \`${id}\``, isError: true };
        return { content: `manage_memory.${action}: ${action === "pin" ? "pinneé" : "despineé"} \`${e.id}\`.` };
      }
      default:
        return { content: `manage_memory: acción desconocida \`${action}\``, isError: true };
    }
  },
};
