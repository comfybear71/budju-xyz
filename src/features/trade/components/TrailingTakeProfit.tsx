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
  const change = async (c: { enabled?: boolean }, text: string) => {
    const r = await saveTrailing(wallet, c);
    if (r) { setData(r); setMsg(`✅ ${text}`); } else setMsg("⛔ Couldn't save — try again");
  };

  const cfg = data?.config;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📈 Trailing take-profit {cfg ? (cfg.enabled ? "· ON" : "· OFF") : ""}</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Master switch for profit-taking. With it <b>ON</b>, a tier doesn't sell the moment a coin reaches its start level — it keeps watching, and sells that tier's slice only
            when the price falls back from its high by <b>that tier's own trail</b> (set on each tier card above). There is <b>no "sell anyway" cap</b>: a coin that keeps climbing is left to run.
            With it <b>OFF</b>, each tier sells its slice as soon as its start level is reached. It never sells below your average cost, and applies to every wallet.
          </p>
          {cfg && (
            <>
              <button
                onClick={() => change({ enabled: !cfg.enabled }, cfg.enabled ? "Switched OFF — each tier sells as soon as its start level is reached" : "Switched ON — sales now wait for each tier's pullback")}
                className="px-3 py-1.5 rounded-lg text-xs font-bold mb-3"
                style={{ background: cfg.enabled ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)", color: cfg.enabled ? "#4ade80" : "#cbd5e1" }}
              >
                {cfg.enabled ? "ON — tap to switch off" : "OFF — tap to switch on"}
              </button>
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
