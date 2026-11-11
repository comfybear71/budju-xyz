import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface Scenario {
  group: string; label: string; coinsTested: number;
  coinsVsDca: number; medianCoinsVsDca: number; h1: number; h2: number; beatDca: number;
  ret: number; dcaRet: number; costVsDca: number; idlePct: number; avgTrades: number;
}
interface LabData {
  coins: number; weekly: number; feePct: number;
  scenarios: Record<string, Scenario>;
  groups: [string, string][];
  verdict: { text: string; winners: { key: string; label: string; gainPts: number }[] };
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const col = (n: number) => (n >= 0 ? "#4ade80" : "#f87171");

/** Admin: Accumulation Lab v1 — which setup gathers the most coins when users keep topping up. Nothing live changes. */
const AccumLab = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [weekly, setWeekly] = useState(25);
  const [fee, setFee] = useState(0.5);
  const [data, setData] = useState<LabData | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (w = weekly, f = fee) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/lab?wallet=${wallet}&admin_wallet=${wallet}&weekly=${w}&fee=${f}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as LabData);
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

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🔬 Accumulation Lab — which setup gathers the most coins?</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Replays the bot on a year of daily prices, <b>with a weekly top-up added for every coin</b> (like users adding AUD). Each row changes ONE thing from today's setup and is
            scored in <b>coins held versus simply buying every top-up straight away</b>. <b>Nothing live changes.</b>
          </p>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <span className="text-[11px] text-slate-500">Top-up per coin per week:</span>
            {[10, 25, 50].map((w) => (
              <button key={w} onClick={() => { setWeekly(w); void run(w, fee); }} className="px-2 py-1 rounded text-[11px] font-bold"
                style={{ background: weekly === w ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: weekly === w ? "#93c5fd" : "#94a3b8" }}>${w}</button>
            ))}
            <span className="text-[11px] text-slate-500 ml-1">Fee:</span>
            {[0.3, 0.5, 1.0].map((f) => (
              <button key={f} onClick={() => { setFee(f); void run(weekly, f); }} className="px-2 py-1 rounded text-[11px] font-bold"
                style={{ background: fee === f ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: fee === f ? "#93c5fd" : "#94a3b8" }}>{f}%</button>
            ))}
            <button onClick={() => run()} disabled={busy} className="text-[11px] text-slate-400">{busy ? "Running…" : "Re-run"}</button>
          </div>
          {failed && <div className="text-xs text-red-400">Couldn't run the lab. Tap Re-run.</div>}
          {data && (
            <>
              <div className="rounded-lg px-3 py-2 mb-2 text-[12px] text-slate-200 leading-relaxed" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
                {data.verdict.text}
              </div>
              <div className="text-[11px] text-slate-400 mb-1">{data.coins} coins tested, ${data.weekly}/week top-up, {data.feePct}% fees. Coins held vs buying every top-up straight away (higher is better):</div>
              {data.groups.map(([g, title]) => {
                const rows = Object.entries(data.scenarios).filter(([, s]) => s.group === g);
                if (!rows.length) return null;
                return (
                  <div key={g} className="mt-2">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-0.5">{title}</div>
                    <div className="overflow-x-auto -mx-1">
                      <table className="w-full text-[11px] whitespace-nowrap">
                        <thead>
                          <tr className="text-slate-500 text-left">
                            <th className="py-1 px-1">Setup</th><th className="px-1 text-right">Coins, year</th><th className="px-1 text-right">1st half</th>
                            <th className="px-1 text-right">2nd half</th><th className="px-1 text-right">Cost/coin</th><th className="px-1 text-right">Idle cash</th>
                            <th className="px-1 text-right">Trades</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([k, s]) => (
                            <tr key={k} className="border-t border-white/[0.05]" style={{ height: 30, background: data.verdict.winners.some((w) => w.key === k) ? "rgba(34,197,94,0.07)" : undefined }}>
                              <td className="px-1 text-slate-200 font-bold">{data.verdict.winners.some((w) => w.key === k) ? "⭐ " : ""}{s.label}</td>
                              <td className="px-1 text-right font-mono font-bold" style={{ color: col(s.coinsVsDca) }}>{pct(s.coinsVsDca)}</td>
                              <td className="px-1 text-right font-mono" style={{ color: col(s.h1) }}>{pct(s.h1)}</td>
                              <td className="px-1 text-right font-mono" style={{ color: col(s.h2) }}>{pct(s.h2)}</td>
                              <td className="px-1 text-right font-mono" style={{ color: col(-s.costVsDca) }}>{pct(s.costVsDca)}</td>
                              <td className="px-1 text-right font-mono text-slate-400">{s.idlePct.toFixed(0)}%</td>
                              <td className="px-1 text-right font-mono text-slate-500">{s.avgTrades}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
              <div className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                "Idle cash" is the share of the account sitting unspent on average — the main cost of waiting for dips. A ⭐ means it beat today's setup by 3+ points in BOTH halves of the year.
                Daily prices miss intraday moves and one year is one (mostly falling) market, so read this as a ranking of ideas to trial on paper, not a forecast. Not financial advice.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AccumLab;
