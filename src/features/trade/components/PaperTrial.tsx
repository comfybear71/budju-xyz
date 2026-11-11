import { useEffect, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface Arm { label: string; value: number; deposited: number; valueVsHold: number; coinsVsHold: number; cashPct: number; trades: number; equity: number[] }
interface Trial {
  started: boolean; startedAt?: string; days?: number; trialDays?: number; startCash?: number; topup?: number;
  defaults?: { startCash: number; topup: number };
  result?: { error?: string; days: number; coins: number; arms: Record<string, Arm>; verdict: string } | null;
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const col = (n: number) => (n > 0.05 ? "#4ade80" : n < -0.05 ? "#f87171" : "#94a3b8");
const COLORS: Record<string, string> = { bot: "#f59e0b", hybrid: "#2dd4bf", hold: "#94a3b8" };

const Chart = ({ arms }: { arms: Record<string, Arm> }) => {
  const W = 320, H = 120;
  const all = Object.values(arms).flatMap((a) => a.equity);
  const lo = Math.min(...all), hi = Math.max(...all);
  const len = Math.max(...Object.values(arms).map((a) => a.equity.length));
  const x = (i: number) => (len > 1 ? (i / (len - 1)) * W : 0);
  const y = (v: number) => H - 5 - ((v - lo) / (hi - lo || 1)) * (H - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
      {Object.entries(arms).map(([k, a]) => (
        <polyline key={k} fill="none" stroke={COLORS[k]} strokeWidth={k === "hold" ? 1.2 : 1.8} strokeDasharray={k === "hold" ? "3 2" : undefined}
          points={a.equity.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} />
      ))}
    </svg>
  );
};

/** Admin: forward paper trial of the whole account — today's bot vs a hybrid vs just holding, same money, same days. Nothing live changes. */
const PaperTrial = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Trial | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cash, setCash] = useState(10000);
  const [topup, setTopup] = useState(1000);

  const call = async (start = false) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/lab-trial?wallet=${wallet}&admin_wallet=${wallet}${start ? `&start=1&start_cash=${cash}&topup=${topup}` : ""}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Trial);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  useEffect(() => {
    if (open && !data && !busy) void call();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const r = data?.result;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🧾 Paper trial — bot vs hybrid vs just holding</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Three pretend accounts get <b>the same money on the same days</b> and use the same coins and one shared cash pool, like the real account.
            <span style={{ color: COLORS.bot }}> Today's bot</span> waits for dips and sells to refill cash.
            <span style={{ color: COLORS.hybrid }}> Hybrid</span> spreads half of every top-up over the coins at once and keeps half for bigger dip buys.
            <span style={{ color: COLORS.hold }}> Just holding</span> buys everything as the money arrives. <b>Nothing here touches your real money.</b>
          </p>
          {failed && <div className="text-xs text-red-400">Couldn't load the trial. <button onClick={() => call()} className="underline">Retry</button></div>}
          {data && !data.started && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="text-[12px] text-slate-200">Not started yet. Pick the pretend money, then start. It runs forward from today for 90 days.</div>
              <label className="block text-[11px] text-slate-400">Starting cash: <b className="text-slate-100">{usd(cash)}</b>
                <input type="range" min={1000} max={50000} step={1000} value={cash} onChange={(e) => setCash(Number(e.target.value))} className="w-full accent-teal-400" /></label>
              <label className="block text-[11px] text-slate-400">Top-up every 30 days: <b className="text-slate-100">{usd(topup)}</b>
                <input type="range" min={0} max={5000} step={100} value={topup} onChange={(e) => setTopup(Number(e.target.value))} className="w-full accent-teal-400" /></label>
              <button onClick={() => call(true)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-200" style={{ background: "rgba(20,184,166,0.2)", border: "1px solid rgba(20,184,166,0.4)" }}>
                {busy ? "Starting…" : "Start the 90-day paper trial"}
              </button>
            </div>
          )}
          {data?.started && (
            <div className="text-[11px] text-slate-400">
              Started {data.startedAt} — <b className="text-slate-100">day {data.days} of {data.trialDays}</b> · {usd(data.startCash ?? 0)} to start, {usd(data.topup ?? 0)} added every 30 days.
            </div>
          )}
          {data?.started && !r && <div className="text-[12px] text-slate-300">Day 1 comes tomorrow — check back then.</div>}
          {r?.error && <div className="text-xs text-amber-400">{r.error}</div>}
          {r && !r.error && (
            <>
              <div className="rounded-lg px-3 py-2 text-[12px] text-slate-100 leading-relaxed" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>{r.verdict}</div>
              <Chart arms={r.arms} />
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left"><th className="py-1 px-1">Account</th><th className="px-1 text-right">Worth now</th><th className="px-1 text-right">Value vs holding</th><th className="px-1 text-right">Coins vs holding</th><th className="px-1 text-right">Cash ready</th><th className="px-1 text-right">Trades</th></tr>
                  </thead>
                  <tbody>
                    {(["bot", "hybrid", "hold"] as const).map((k) => {
                      const a = r.arms[k];
                      if (!a) return null;
                      return (
                        <tr key={k} className="border-t border-white/[0.05]" style={{ height: 30 }}>
                          <td className="px-1 font-bold" style={{ color: COLORS[k] }}>{a.label.split(" (")[0]}</td>
                          <td className="px-1 text-right font-mono text-slate-200">{usd(a.value)}</td>
                          <td className="px-1 text-right font-mono font-bold" style={{ color: col(a.valueVsHold) }}>{k === "hold" ? "—" : pct(a.valueVsHold)}</td>
                          <td className="px-1 text-right font-mono font-bold" style={{ color: col(a.coinsVsHold) }}>{k === "hold" ? "—" : pct(a.coinsVsHold)}</td>
                          <td className="px-1 text-right font-mono text-slate-400">{a.cashPct.toFixed(0)}%</td>
                          <td className="px-1 text-right font-mono text-slate-500">{a.trades}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                <b>Green = better than just holding, red = worse.</b> "Cash ready" is the dry powder each account still has. The pass mark is read on day {data?.trialDays}:
                a dip setup is worth a small real-money slice only if it holds at least as many coins as just holding.
              </div>
            </>
          )}
          <div className="text-[10px] text-slate-500 leading-relaxed">Daily prices only; 90 days is one short stretch of one market. Not financial advice.</div>
        </div>
      )}
    </div>
  );
};

export default PaperTrial;
