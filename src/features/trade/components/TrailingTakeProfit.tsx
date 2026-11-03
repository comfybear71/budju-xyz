import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { fetchTrailing, saveTrailing, type TrailingOverview } from "../services/tradeApi";

/** Admin: trailing take-profit. When a coin reaches its sell level it is NOT sold at once; it is sold when it pulls back from its high. */
const TrailingTakeProfit = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<TrailingOverview | null>(null);
  const [msg, setMsg] = useState("");

  const load = async () => setData(await fetchTrailing(wallet));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data) void load();
  };
  const change = async (c: { enabled?: boolean; pullbackPct?: number; capPct?: number }, text: string) => {
    const r = await saveTrailing(wallet, c);
    if (r) { setData(r); setMsg(`✅ ${text}`); } else setMsg("⛔ Couldn't save — try again");
  };

  const cfg = data?.config;
  const pill = (active: boolean) => ({ background: active ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: active ? "#93c5fd" : "#94a3b8" });

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📈 Trailing take-profit {cfg ? (cfg.enabled ? "· ON" : "· OFF") : ""}</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Normally the bot sells its slice the moment a coin reaches its sell level (+12.5% / +15% / +20%). With this ON it <b>keeps watching instead</b>: if the coin keeps climbing it waits,
            and sells only when the price falls back from its high by the pullback below — or when it has run past the sell level by the cap. The <b>size of the sale is unchanged</b>
            (each tier's own slice) and it never sells below your average cost. Applies to every tier and every wallet. <b>OFF until you switch it on.</b>
          </p>
          {cfg && (
            <>
              <button
                onClick={() => change({ enabled: !cfg.enabled }, cfg.enabled ? "Switched OFF — sells happen at the sell level as before" : "Switched ON — sales now wait for a pullback")}
                className="px-3 py-1.5 rounded-lg text-xs font-bold mb-3"
                style={{ background: cfg.enabled ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)", color: cfg.enabled ? "#4ade80" : "#cbd5e1" }}
              >
                {cfg.enabled ? "ON — tap to switch off" : "OFF — tap to switch on"}
              </button>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Sell when it falls back this far from its high</div>
              <div className="flex gap-1.5 mb-3">
                {[3, 5, 8, 12].map((v) => (
                  <button key={v} onClick={() => change({ pullbackPct: v }, `Pullback set to ${v}%`)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold" style={pill(cfg.pullbackPct === v)}>{v}%</button>
                ))}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Sell anyway if it runs this far past the sell level</div>
              <div className="flex gap-1.5 mb-2">
                {[15, 25, 40, 80].map((v) => (
                  <button key={v} onClick={() => change({ capPct: v }, `Cap set to ${v}%`)} className="px-2.5 py-1.5 rounded-lg text-xs font-bold" style={pill(cfg.capPct === v)}>{v}%</button>
                ))}
              </div>
              {msg && <div className="text-xs text-slate-200 rounded-lg px-2 py-1.5 mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>{msg}</div>}
              <div className="text-[11px] text-slate-400">
                {data && data.armed.length > 0
                  ? <>Letting these run right now: {data.armed.map((a) => `${a.signal} (high $${Number(a.high).toLocaleString(undefined, { maximumFractionDigits: 4 })})`).join(", ")}</>
                  : "Nothing is being held back for a higher price right now."}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TrailingTakeProfit;
