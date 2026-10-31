import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchDipReport, type DipCoin, type DipReport as Report } from "../services/tradeApi";

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;

type Badge = { icon: string; label: string; color: string; bg: string };

/** One glance: is this coin good, careful, quiet or blocked? */
const badgeFor = (c: DipCoin): Badge => {
  if (c.denied) return { icon: "🚫", label: "Blocked", color: "#94a3b8", bg: "rgba(148,163,184,0.15)" };
  if (c.advice.startsWith("Careful")) return { icon: "⚠️", label: "Careful", color: "#f87171", bg: "rgba(239,68,68,0.15)" };
  if (c.advice.startsWith("Quiet")) return { icon: "💤", label: "Quiet", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
  if (c.focus) return { icon: "⭐", label: "Top", color: "#facc15", bg: "rgba(250,204,21,0.15)" };
  return { icon: "✅", label: "OK", color: "#4ade80", bg: "rgba(34,197,94,0.12)" };
};

const DipReport = ({ wallet, assignments = {} }: { wallet: string; assignments?: Record<string, number[]> }) => {
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
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="py-1 px-1">#</th>
                      <th className="px-1">Coin</th>
                      <th className="px-1">Status</th>
                      <th className="px-1">In tiers</th>
                      <th className="px-1 text-right">Avg/buy</th>
                      <th className="px-1 text-right">1y</th>
                      <th className="px-1">Dips T1/T2/T3</th>
                      <th className="px-1">Open</th>
                      <th className="px-1">Yours B/S</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.coins.map((c, i) => {
                      const b = badgeFor(c);
                      const mine = assignments[c.coin] || [];
                      return (
                        <tr key={c.coin} className="border-t border-white/[0.05]" style={{ height: 30 }}>
                          <td className="px-1 text-slate-600">{i + 1}</td>
                          <td className="px-1 font-bold text-slate-200">{c.coin}</td>
                          <td className="px-1">
                            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: b.bg, color: b.color }} title={c.advice}>
                              {b.icon} {b.label}
                            </span>
                          </td>
                          <td className="px-1">
                            <span className="inline-flex gap-0.5">
                              {[1, 2, 3].map((t) => (
                                <span
                                  key={t}
                                  className="w-5 h-4 rounded text-[9px] font-bold flex items-center justify-center"
                                  style={{
                                    background: mine.includes(t) ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.05)",
                                    color: mine.includes(t) ? "#4ade80" : "#475569",
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </span>
                          </td>
                          <td className="px-1 text-right font-mono font-bold" style={{ color: c.perBuy >= 0 ? "#22c55e" : "#ef4444" }}>
                            {c.perBuy >= 0 ? "+" : ""}{c.perBuy.toFixed(1)}%
                          </td>
                          <td className="px-1 text-right font-mono" style={{ color: c.change1y >= 0 ? "#22c55e" : "#ef4444" }}>{pct(c.change1y)}</td>
                          <td className="px-1 font-mono text-slate-400">{c.tiers.t1.buys}/{c.tiers.t2.buys}/{c.tiers.t3.buys}</td>
                          <td className="px-1 font-mono text-slate-500">{c.tiers.t1.open + c.tiers.t2.open + c.tiers.t3.open}</td>
                          <td className="px-1 font-mono text-slate-500">{c.yourBuys ?? 0}/{c.yourSells ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">
                ⭐ Top = best 15 · ✅ OK · ⚠️ Careful = dips often don't come back · 💤 Quiet = rarely dips · 🚫 Blocked. The green 1/2/3 squares show which tiers the coin is in now. Scroll sideways for more columns.
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
