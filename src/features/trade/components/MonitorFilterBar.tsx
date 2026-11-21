import { FILTERS, type MonitorFilter } from "./monitorFilter";

/** Chips above the coin columns: All / Cooldown / Buy imminent / Discounted / Others, each with how many cards it holds. */
const MonitorFilterBar = ({ value, counts, onChange }: { value: MonitorFilter; counts: Record<MonitorFilter, number>; onChange: (f: MonitorFilter) => void }) => (
  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
    {FILTERS.map((f) => {
      const on = value === f.id;
      return (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors"
          style={{
            background: on ? "rgba(59,130,246,0.22)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${on ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.08)"}`,
            color: on ? "#93c5fd" : "#94a3b8",
          }}
        >
          {f.label} <span className="font-mono opacity-70">{counts[f.id]}</span>
        </button>
      );
    })}
  </div>
);

export default MonitorFilterBar;
