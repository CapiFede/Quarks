import { Icon, type Quark } from "@quarks/core";
import { EditorStore } from "./store";
import { EditorPage } from "./sections/EditorPage";
import { EditorToolbar } from "./sections/EditorToolbar";

/**
 * Implementación del contrato `Quark` para el Editor. Posee un `EditorStore`
 * propio que comparten su página y su toolbar (ver `store.ts`). El Shell llama
 * `initialize()` al abrir el tab y `dispose()` al cerrarlo.
 */
export function createEditorQuark(): Quark {
  const store = new EditorStore();

  return {
    id: "editor",
    name: "Editor",
    icon: <Icon name="content_cut" size={16} />,

    buildPage: () => <EditorPage store={store} />,
    buildToolbar: () => <EditorToolbar store={store} />,

    onEscape: () => {
      const s = store.getSnapshot();
      if (s.saveOpen) {
        store.closeSave();
        return true;
      }
      if (s.selection) {
        store.clearSelection();
        return true;
      }
      return false;
    },

    initialize: () => store.init(),
    dispose: () => store.dispose(),
  };
}
