import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface Position { coin?: string; side: string; sizeUsd?: string | null; entry?: string | null; pnl?: string | null; leverage?: number | null }
interface Trader {
  address: string; name?: string | null; liveAccount: number; monthPnl: number; monthRoi: number; allTimePnl: number;
  positions: Position[]; positionsError?: string; fillsError?: string;
  stats: { fills: number; closedTrades: number; winRate: number | null; winStreak: number; avgTradeUsd: number | null; coins: string[] } | null;
}
interface Probe { leaderboard: { ok?: boolean; error?: string; rows?: number; seconds?: number }; candidates: number; checked: number; traders: Trader[] }

const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const usd = (n: number | string | null | undefined) => (n == null || n === "" || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

/** Admin, read-only: is Hyperliquid's public trader data reachable and usable? Nothing is traded. */
const HyperliquidTest = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 58000);
      const res = await fetch(`/api/admin/hyperliquid-probe?wallet=${wallet}&admin_wallet=${wallet}`, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Probe);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const copy = () => {
    try {
      void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📈 Profitable traders test (Hyperliquid)</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Read-only test: loads Hyperliquid's public leaderboard, picks consistently profitable traders (believable returns, still funded, a real trading record) and shows their open positions
            and win rate — like the Phantom "Profitable Trader" cards. Nothing is traded.
          </p>
          <div className="flex gap-2 mb-2">
            <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40">
              {busy ? "Loading (up to a minute)…" : "Run test"}
            </button>
            {data && <button onClick={copy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-slate-400">Copy details</button>}
          </div>
          {failed && <div className="text-xs text-red-400">Couldn't run the test. Try again.</div>}
          {data && (
            <>
              <div className="text-[11px] text-slate-300 mb-2">
                {data.leaderboard.ok ? `✅ Leaderboard: ${data.leaderboard.rows?.toLocaleString()} traders in ${data.leaderboard.seconds}s` : `⛔ Leaderboard failed — ${data.leaderboard.error}`}
              </div>
              <div className="text-[11px] text-slate-400 mb-2">
                {data.candidates.toLocaleString()} traders look consistently profitable; the top {data.checked} were checked live and <b className="text-slate-200">{data.traders.length}</b> passed
                (still funded, at least 20 closed trades).
              </div>
              {data.traders.length === 0 && <div className="text-[11px] text-amber-400">None passed the live check this time — try again later.</div>}
              <div className="space-y-2">
                {data.traders.map((tr) => (
                  <div key={tr.address} className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.03)" }}>
                    <div className="flex justify-between gap-2 text-[11px] font-bold text-slate-200 mb-1">
                      <span>{tr.name || short(tr.address)} · {usd(tr.liveAccount)}</span>
                      <span className="text-green-400">+{tr.monthRoi}% · {usd(tr.monthPnl)}/mo</span>
                    </div>
                    {tr.stats && (
                      <div className="text-[11px] text-slate-300 mb-1">
                        Win rate <b>{tr.stats.winRate ?? "—"}%</b> over {tr.stats.closedTrades} closed trades · streak <b>{tr.stats.winStreak}</b> · average trade {usd(tr.stats.avgTradeUsd)}
                        {tr.stats.coins.length > 0 && <span className="text-slate-500"> · {tr.stats.coins.join(", ")}</span>}
                      </div>
                    )}
                    {tr.positions.length === 0 ? (
                      <div className="text-[11px] text-slate-500">No open positions right now.</div>
                    ) : (
                      tr.positions.map((p, i) => (
                        <div key={i} className="text-[11px] text-slate-300 flex justify-between">
                          <span><b>{p.coin}</b> {p.leverage ? `${p.leverage}x ` : ""}<span style={{ color: p.side === "long" ? "#4ade80" : "#f87171" }}>{p.side}</span> · {usd(p.sizeUsd)}</span>
                          <span style={{ color: Number(p.pnl) >= 0 ? "#4ade80" : "#f87171" }}>{usd(p.pnl)}</span>
                        </div>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default HyperliquidTest;
