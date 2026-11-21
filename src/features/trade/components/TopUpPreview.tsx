import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { fetchTopUpPreview, type TopUpPreview } from "../services/tradeApi";

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Admin: "if I add $X of USDC, what would the bot buy?" Uses the live buying rules and prices. Places NO orders. */
const TopUpPreviewCard = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(3250);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<TopUpPreview | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    const r = await fetchTopUpPreview(wallet, amount);
    setBusy(false);
    if (r) setData(r); else setFailed(true);
  };

  const reasons = new Map<string, number>();
  for (const w of data?.waiting ?? []) reasons.set(w.why, (reasons.get(w.why) ?? 0) + 1);

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🔮 If I add USDC — what would it buy?</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Replays the bot's real rules on today's prices, pauses and limits. <b>Nothing is bought.</b> Prices move, so treat it as a close guide.
          </p>
          <label className="block text-[11px] text-slate-400">Pretend I add (USDC): <b className="text-slate-100">{usd(amount)}</b>
            <input type="range" min={100} max={10000} step={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-teal-400" />
          </label>
          <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold text-teal-200 disabled:opacity-50" style={{ background: "rgba(20,184,166,0.2)", border: "1px solid rgba(20,184,166,0.4)" }}>
            {busy ? "Working it out…" : "Show me"}
          </button>
          {failed && <div className="text-xs text-red-400">Couldn't load. Try again.</div>}
          {data && (
            <div className="space-y-2">
              {data.repairPending && (
                <div className="text-[10px] text-amber-300 leading-snug">The one-time repair hasn't run yet, so this already assumes it has (the 22 earlier buys count as bought).</div>
              )}
              <div className="rounded-lg px-3 py-2 text-[12px] text-slate-100 leading-relaxed" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
                Would make <b>{data.buys} buys</b> for <b>{usd(data.total)}</b>, leaving <b>{usd(data.cashLeft)}</b>. A run does about 18 buys, so that's <b>{data.runsNeeded} run{data.runsNeeded === 1 ? "" : "s"}</b> (5 minutes each).
              </div>
              <div className="max-h-64 overflow-y-auto rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead className="sticky top-0" style={{ background: "#0f172a" }}>
                    <tr className="text-slate-500 text-left"><th className="py-1 px-2">#</th><th className="px-1">Coin</th><th className="px-1">Tier</th><th className="px-1">Why this place</th><th className="px-1 text-right">Spend</th><th className="px-1 text-right">% of cash</th><th className="px-2 text-right">Below buy price</th></tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={`${r.coin}-${r.tier}`} className="border-t border-white/[0.05]">
                        <td className="py-1 px-2 text-slate-500">{r.n}</td>
                        <td className="px-1 font-bold text-slate-200">{r.coin}</td>
                        <td className="px-1 text-slate-400">T{r.tier}</td>
                        <td className="px-1 text-slate-500">{r.group ?? ""}</td>
                        <td className="px-1 text-right font-mono text-green-400">{usd2(r.amount)}{r.capped ? " ⛔" : ""}</td>
                        <td className="px-1 text-right font-mono text-slate-400">{data.startCash > 0 ? ((r.amount / data.startCash) * 100).toFixed(1) : "0"}%</td>
                        <td className="px-2 text-right font-mono text-slate-400">{r.below.toFixed(1)}%</td>
                      </tr>
                    ))}
                    {data.rows.length === 0 && <tr><td colSpan={7} className="py-2 px-2 text-slate-500">Nothing would be bought right now.</td></tr>}
                  </tbody>
                </table>
              </div>
              {data.waitingCount > 0 && (
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  <b className="text-slate-200">{data.waitingCount} more would be left waiting:</b>
                  <ul className="list-disc pl-4 mt-0.5">
                    {[...reasons.entries()].map(([why, n]) => <li key={why}>{n} — {why}</li>)}
                  </ul>
                </div>
              )}
              <div className="text-[10px] text-slate-500 leading-snug">
                Order: Careful (shit list) coins last, capped at $50 a buy; otherwise by the Holdings groups (Top 10 first, BTC/ETH/SOL ahead of the rest of it, then Innovation, Top 50, Top 200, Smaller); inside each: accumulate coins, then coins you hold little of, then the deepest below its own buy price, equal ones T3, T2, T1. The first buys are the biggest because each takes a % of the cash left. Rules used: each buy is the tier's % of the cash left (at least $8); a single buy is capped at {usd(data.maxSingleBuy)} (⛔ = capped); {usd(data.reserve)} is kept spare; daily limit {usd(data.dailyLimit)} ({usd(data.spentBefore)} used in the last 24h).
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TopUpPreviewCard;
