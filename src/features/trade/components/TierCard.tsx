import { useState } from "react";

export interface TierPlan { arm: number; trail: number; slice: number }
export interface TierEdit { deviation: number; allocation: number; cooldownHours: number; arm: number; trail: number; slice: number }

interface Props {
  num: number;
  name: string;
  color: string;
  active: boolean;
  coins: number;
  deviation: number;
  allocation: number;
  cooldownHours: number;
  plan: TierPlan | null;
  hasCooldowns: boolean;
  starting: boolean;
  onStart: () => void;
  onStop: () => void;
  onOverride: () => void;
  onSave: (edit: TierEdit) => Promise<{ ok: boolean; error?: string }>;
}

const Slider = ({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) => (
  <label className="block">
    <div className="flex justify-between text-[10px] text-slate-400"><span>{label}</span><span className="font-mono font-bold text-slate-100">{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-400" />
  </label>
);

/** One tier: its rules shown as fixed text, with an "Unlock to edit" step so a stray touch can never change or reset anything. */
const TierCard = (p: Props) => {
  const plan = p.plan ?? { arm: NaN, trail: NaN, slice: NaN };
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [d, setD] = useState<TierEdit>({ deviation: p.deviation, allocation: p.allocation, cooldownHours: p.cooldownHours, arm: plan.arm, trail: plan.trail, slice: plan.slice });

  const unlock = () => {
    setD({ deviation: p.deviation, allocation: p.allocation, cooldownHours: p.cooldownHours, arm: plan.arm, trail: plan.trail, slice: plan.slice });
    setMsg("");
    setEditing(true);
  };

  const buyChanged = d.deviation !== p.deviation;
  const anyChanged = buyChanged || d.allocation !== p.allocation || d.cooldownHours !== p.cooldownHours || d.arm !== plan.arm || d.trail !== plan.trail || d.slice !== plan.slice;

  const save = async () => {
    if (buyChanged && !window.confirm(`Changing the dip % moves the buy levels of ${p.coins} coins in this tier to today's price. Continue?`)) return;
    setBusy(true);
    const r = await p.onSave(d);
    setBusy(false);
    if (r.ok) {
      setMsg("✅ Saved");
      setEditing(false);
    } else {
      setMsg(`⛔ ${r.error || "Couldn't save"}`);
    }
  };

  return (
    <div className="flex-shrink-0 rounded-xl p-4 snap-start w-[min(300px,85vw)] md:w-auto md:min-w-0 md:flex-shrink" style={{ background: `${p.color}10`, border: `1px solid ${p.color}25` }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[14px] font-bold" style={{ color: p.color }}>T{p.num} – {p.name}</span>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg" style={{ background: p.active ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)", color: p.active ? "#22c55e" : "#64748b" }}>
          {p.active ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>
      <div className="mb-2 text-[10px] font-bold" style={{ color: p.color }}>{p.coins} coins</div>

      {!editing ? (
        <div className="space-y-2 text-[11px] leading-relaxed">
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.18)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold text-green-400 mb-0.5">Buys</div>
            <span className="text-slate-300">On a <b>-{p.deviation}%</b> dip, spends <b>{p.allocation}%</b> of your cash. Waits <b>{p.cooldownHours}h</b> between buys.</span>
          </div>
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)" }}>
            <div className="text-[9px] uppercase tracking-wider font-bold text-red-400 mb-0.5">Takes profit</div>
            {p.plan ? (
              <span className="text-slate-300">Starts watching at <b>+{plan.arm}%</b>. Sells <b>{plan.slice}%</b> of the position once the price falls back <b>{plan.trail}%</b> from its high.</span>
            ) : (
              <span className="text-slate-500">Loading…</span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-green-400">Buys</div>
          <Slider label="Buy when it dips" value={d.deviation} min={1} max={30} step={0.5} unit="%" onChange={(v) => setD({ ...d, deviation: v })} />
          <Slider label="Spend of your cash" value={d.allocation} min={1} max={40} step={1} unit="%" onChange={(v) => setD({ ...d, allocation: v })} />
          <div>
            <div className="text-[10px] text-slate-400 mb-1">Wait between buys</div>
            <div className="flex gap-1.5">
              {[6, 12, 24].map((h) => (
                <button key={h} onClick={() => setD({ ...d, cooldownHours: h })} className="flex-1 py-1 rounded-lg text-[10px] font-bold"
                  style={{ background: d.cooldownHours === h ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.04)", color: d.cooldownHours === h ? "#f59e0b" : "#64748b" }}>{h}h</button>
              ))}
            </div>
          </div>
          <div className="text-[10px] font-bold text-red-400 pt-1">Takes profit</div>
          <Slider label="Start watching at" value={d.arm} min={3} max={200} step={0.5} unit="%" onChange={(v) => setD({ ...d, arm: v })} />
          <Slider label="Sell after a fall of" value={d.trail} min={1} max={30} step={0.5} unit="%" onChange={(v) => setD({ ...d, trail: v })} />
          <Slider label="Sell this share of the position" value={d.slice} min={1} max={50} step={0.5} unit="%" onChange={(v) => setD({ ...d, slice: v })} />
          {buyChanged && <div className="text-[10px] text-amber-400 leading-snug">Changing the dip % re-anchors this tier's buy levels to today's price.</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy || !anyChanged} className="flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-40" style={{ background: "rgba(59,130,246,0.25)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={busy} className="flex-1 py-2 rounded-xl text-xs font-bold text-slate-300" style={{ background: "rgba(255,255,255,0.06)" }}>Cancel</button>
          </div>
        </div>
      )}

      {msg && <div className="text-[11px] text-slate-200 mt-2">{msg}</div>}

      <div className="flex gap-2 mt-3">
        {!p.active ? (
          <button onClick={p.onStart} disabled={p.starting} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: p.starting ? "#64748b" : "#22c55e", color: "#fff" }}>
            {p.starting ? "Starting..." : "Start"}
          </button>
        ) : (
          <button onClick={p.onStop} className="flex-1 py-2.5 rounded-xl text-xs font-bold" style={{ background: "#ef4444", color: "#fff" }}>Stop</button>
        )}
        {!editing && (
          <button onClick={unlock} className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-300" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
            🔒 Unlock to edit
          </button>
        )}
      </div>
      {editing && p.active && p.hasCooldowns && (
        <button onClick={p.onOverride} className="w-full mt-2 py-1.5 rounded-lg text-[10px] font-bold text-red-300" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>
          Advanced: clear this tier's cooldown timers
        </button>
      )}
    </div>
  );
};

export default TierCard;
