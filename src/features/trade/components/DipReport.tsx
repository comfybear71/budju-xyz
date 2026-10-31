import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchDipReport, type DipReport as Report } from "../services/tradeApi";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

const DipReport = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prog, setProg] = useState<[number, number] | null>(null);

  const load = async (force = false) => {
    setLoading(true);
    setFailed(false);
    const r = await fetchDipReport(wallet, force, (d, t) => setProg([d, t]));
    setProg(null);
    setData(r);
    setFailed(!r);
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📉 Dip Report — which coins to accumulate</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Replays the last year of daily prices through your tier rules (T1 −5%/+12.5%, T2 −8.5%/+15%, T3 −15%/+20%).
            Avg/buy = average % gained per dip bought (open lots counted at today's price). Daily prices miss some intraday dips.
          </p>
          <button onClick={() => load(true)} disabled={loading} className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
            <FaSync size={10} className={loading ? "animate-spin" : ""} /> {loading ? (prog ? `Loading prices ${prog[0]}/${prog[1]}…` : "Working…") : "Refresh"}
          </button>
          {failed && <div className="text-xs text-red-400">Couldn't load the report. Tap Refresh to try again.</div>}
          {data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="py-1 pr-2">#</th>
                      <th className="pr-2">Coin</th>
                      <th className="pr-2">Buys T1/T2/T3</th>
                      <th className="pr-2">Open</th>
                      <th className="pr-2">Avg/buy</th>
                      <th className="pr-2">1y</th>
                      <th className="pr-2">Worst fall</th>
                      <th className="pr-2">Yours (B/S)</th>
                      <th>Advice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coins.map((c, i) => (
                      <tr key={c.coin} className="border-t border-white/[0.05]" style={{ background: c.focus ? "rgba(34,197,94,0.06)" : undefined }}>
                        <td className="py-1.5 pr-2 text-slate-500">{i + 1}</td>
                        <td className="pr-2 font-bold text-slate-200">{c.focus ? "⭐ " : ""}{c.coin}{c.denied ? " 🚫" : ""}</td>
                        <td className="pr-2 font-mono text-slate-300">{c.tiers.t1.buys}/{c.tiers.t2.buys}/{c.tiers.t3.buys}</td>
                        <td className="pr-2 font-mono text-slate-400">{c.tiers.t1.open + c.tiers.t2.open + c.tiers.t3.open}</td>
                        <td className="pr-2 font-mono font-bold" style={{ color: c.perBuy >= 0 ? "#22c55e" : "#ef4444" }}>{c.perBuy >= 0 ? "+" : ""}{c.perBuy.toFixed(1)}%</td>
                        <td className="pr-2 font-mono" style={{ color: c.change1y >= 0 ? "#22c55e" : "#ef4444" }}>{pct(c.change1y)}</td>
                        <td className="pr-2 font-mono text-slate-400">−{c.maxDrawdown.toFixed(0)}%</td>
                        <td className="pr-2 font-mono text-slate-400">{c.yourBuys ?? 0}/{c.yourSells ?? 0}</td>
                        <td className="text-slate-300">{c.advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                ⭐ = suggested accumulate list (top 15, excludes blocked and "careful" coins). 🚫 = on your blocked list.
                {data.pending && data.pending.length > 0 ? ` No data yet for: ${data.pending.join(", ")} — tap Refresh.` : ""}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DipReport;
