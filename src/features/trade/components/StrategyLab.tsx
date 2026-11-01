import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface Variant { label: string; avgRet: number; medianRet: number; avgH1: number; avgH2: number; avgHold: number; beatHold: number; avgTrades: number }
interface Lab { coins: number; feePct: number; variants: Record<string, Variant>; bestByCoin: Record<string, string>; bestCounts: Record<string, number>; skipped: string[] }

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const col = (n: number) => (n >= 0 ? "#4ade80" : "#f87171");

/** Admin: replays the bot's rules, and alternatives, on a year of daily prices. Nothing live changes. */
const StrategyLab = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(0.5);
  const [data, setData] = useState<Lab | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showCoins, setShowCoins] = useState(false);

  const run = async (f = fee) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/strategy-lab?wallet=${wallet}&admin_wallet=${wallet}&fee=${f}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Lab);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !busy) void run();
  };

  const rows = data ? Object.entries(data.variants).sort((a, b) => b[1].avgRet - a[1].avgRet) : [];
  const best = rows[0]?.[0];
  const names = (v: string) => data?.variants[v]?.label ?? v;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🧪 Strategy Lab — which sell rule works best?</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Replays the bot (same three tiers, $1,000 per coin) over a year of daily prices with different ways of taking profit. <b>Nothing live changes.</b> A rule is only worth a
            real trial if it wins on many coins AND in both halves of the year.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-slate-500">Fee per trade:</span>
            {[0.3, 0.5, 1.0].map((f) => (
              <button key={f} onClick={() => { setFee(f); void run(f); }} className="px-2 py-1 rounded text-[11px] font-bold"
                style={{ background: fee === f ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: fee === f ? "#93c5fd" : "#94a3b8" }}>{f}%</button>
            ))}
            <button onClick={() => run()} disabled={busy} className="text-[11px] text-slate-400">{busy ? "Running…" : "Re-run"}</button>
          </div>
          {failed && <div className="text-xs text-red-400">Couldn't run the lab. Tap Re-run.</div>}
          {data && (
            <>
              <div className="text-[11px] text-slate-400 mb-1">{data.coins} coins tested. Average result per coin over the year (and each half), after {data.feePct}% fees:</div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="py-1 px-1">Rule</th><th className="px-1 text-right">Year</th><th className="px-1 text-right">1st half</th>
                      <th className="px-1 text-right">2nd half</th><th className="px-1 text-right">Beat hold</th><th className="px-1 text-right">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([k, v]) => (
                      <tr key={k} className="border-t border-white/[0.05]" style={{ height: 30, background: k === best ? "rgba(34,197,94,0.07)" : undefined }}>
                        <td className="px-1 text-slate-200 font-bold">{k === best ? "⭐ " : ""}{v.label}</td>
                        <td className="px-1 text-right font-mono font-bold" style={{ color: col(v.avgRet) }}>{pct(v.avgRet)}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(v.avgH1) }}>{pct(v.avgH1)}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(v.avgH2) }}>{pct(v.avgH2)}</td>
                        <td className="px-1 text-right font-mono text-slate-400">{v.beatHold}/{data.coins}</td>
                        <td className="px-1 text-right font-mono text-slate-500">{v.avgTrades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Just holding each coin averaged <b style={{ color: col(rows[0]?.[1].avgHold ?? 0) }}>{pct(rows[0]?.[1].avgHold ?? 0)}</b> over the year.
              </div>

              <button onClick={() => setShowCoins(!showCoins)} className="mt-3 text-[11px] font-bold text-slate-300 underline">
                Different coins prefer different rules ({showCoins ? "hide" : "show"})
              </button>
              {showCoins && (
                <div className="mt-1 text-[11px] text-slate-300 leading-relaxed">
                  {Object.entries(data.bestCounts).sort((a, b) => b[1] - a[1]).map(([v, n]) => (
                    <div key={v}><b>{names(v)}</b> was best for {n} coin{n === 1 ? "" : "s"}: <span className="text-slate-500">
                      {Object.entries(data.bestByCoin).filter(([, bv]) => bv === v).map(([c]) => c).join(", ")}</span></div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Daily prices miss intraday moves; one year is one market. Read this as a ranking of ideas, not a forecast, and prefer rules that win in both halves.
                {data.skipped.length > 0 ? ` Not tested (too little history): ${data.skipped.join(", ")}.` : ""} Not financial advice.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default StrategyLab;
