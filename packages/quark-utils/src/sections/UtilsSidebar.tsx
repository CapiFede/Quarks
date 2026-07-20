import { Icon } from "@quarks/core";
import type { UtilsStore } from "../store";
import type { Tool } from "../types";

interface ItemSpec {
  id: Tool;
  label: string;
  icon: string;
}

const ITEMS: ItemSpec[] = [
  { id: "clocks", label: "Relojes", icon: "schedule" },
  { id: "random", label: "Random", icon: "casino" },
];

export interface UtilsSidebarProps {
  store: UtilsStore;
  active: Tool;
}

export function UtilsSidebar({ store, active }: UtilsSidebarProps) {
  return (
    <div className="q-utils-sidebar">
      {ITEMS.map((it) => (
        <div
          key={it.id}
          className="q-utils-sidebar-item"
          data-active={it.id === active}
          onClick={() => store.selectTool(it.id)}
        >
          <Icon name={it.icon} size={16} />
          <span>{it.label}</span>
        </div>
      ))}
    </div>
  );
}
