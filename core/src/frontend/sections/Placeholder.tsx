import { Icon } from "../components/Icon";
import type { QuarkStub } from "../../quark/registry";

/** Estado vacío para un quark abierto que todavía no está implementado. */
export function Placeholder({ quark }: { quark?: QuarkStub }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "var(--q-text-light)",
      }}
    >
      <Icon name={quark?.icon ?? "widgets"} size={48} color="var(--q-text-light)" />
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--q-text-secondary)" }}>
        {quark?.name ?? "Quark"}
      </div>
      <div style={{ fontSize: 13 }}>En construcción</div>
    </div>
  );
}
