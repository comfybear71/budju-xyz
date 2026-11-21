import { useEffect, useState } from "react";
import { fetchDailyLimit, saveDailyLimit, type DailyLimitInfo } from "../services/tradeApi";

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Your own cap on how much the bot may BUY in any rolling 24 hours. Protects you in a crash. Each wallet sets its own. */
const DailyLimit = ({ wallet }: { wallet: string }) => {
  const [info, setInfo] = useState<DailyLimitInfo | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchDailyLimit(wallet).then((r) => { if (live && r) { setInfo(r); setValue(r.limit); } });
    return () => { live = false; };
  }, [wallet]);

  if (!info) return null;
  const changed = value !== info.limit;
  const pct = Math.min(100, info.limit > 0 ? (info.spent24h / info.limit) * 100 : 0);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await saveDailyLimit(wallet, value);
    setBusy(false);
    if (r) { setInfo(r); setValue(r.limit); setMsg("✅ Saved"); } else { setMsg("⛔ Couldn't save — try again"); }
  };

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-slate-200">🛡️ Daily buying limit</span>
        <span className="text-[12px] font-mono font-bold text-teal-300">{usd(value)}</span>
      </div>
      <div className="text-[10px] text-slate-400 mb-2 leading-snug">
        The most the bot will buy for you in any 24 hours. Bought in the last 24h: <b className="text-slate-200">{usd(info.spent24h)}</b> of {usd(info.limit)}.
      </div>
      <div className="w-full h-1.5 rounded-full mb-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "#f59e0b" : "#2dd4bf" }} />
      </div>
      <input type="range" min={info.min} max={info.max} step={100} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-teal-400" />
      <div className="flex justify-between text-[9px] text-slate-500"><span>{usd(info.min)}</span><span>{usd(info.max)}</span></div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={save} disabled={busy || !changed} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: "rgba(59,130,246,0.25)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        {!info.isCustom && !msg && <span className="text-[10px] text-slate-500">Using the default ({usd(info.default)})</span>}
        {msg && <span className="text-[11px] text-slate-200">{msg}</span>}
      </div>
      {info.rules && info.rules.tiers && (
        <div className="mt-3 pt-2 border-t border-white/[0.06]">
          <button onClick={() => setShowRules(!showRules)} className="text-[11px] font-bold text-blue-300">
            {showRules ? "▾" : "▸"} ℹ️ All the bot's limits
          </button>
          {showRules && (
            <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300 leading-snug list-disc pl-4">
              <li><b>Daily buying limit:</b> the most it buys for you in any 24 hours — yours is {usd(info.limit)} (set above).</li>
              <li><b>Biggest single buy: {usd(info.rules.maxSingleBuy)}.</b> If a buy would be larger, it buys {usd(info.rules.maxSingleBuy)} instead.</li>
              {info.rules.coinCapPct ? <li><b>Most in one coin: {info.rules.coinCapPct}% of the day's money</b> (your cash plus what was bought in the last 24 hours), all its tiers together. This stops one coin taking a big share of a top-up.</li> : null}
              <li><b>Smallest buy: ${info.rules.minBuy}.</b> Smaller amounts are lifted to this.</li>
              <li><b>Cash kept spare: ${info.rules.keepSpare}.</b> It never spends your last ${info.rules.keepSpare} of USDC.</li>
              <li><b>How much each buy takes</b> (of your USDC left at that moment): {Object.entries(info.rules.tiers).map(([t, c]) => `T${t} ${c.spend}% (on a ${c.dip}% dip)`).join(", ")}. So the first buys are the biggest.</li>
              <li><b>Pause after a buy</b> (per coin and tier): {Object.entries(info.rules.tiers).map(([t, c]) => `T${t} ${c.pauseHours}h`).join(", ")}.</li>
              <li><b>Speed:</b> about {info.rules.buysPerRun} buys every {info.rules.runMinutes} minutes. A big top-up is spread over several runs.</li>
              <li><b>Order:</b> by the same groups as your Holdings: Top 10 first (BTC, ETH, SOL ahead of the rest of the Top 10), then Innovation, Top 50, Top 200 and Smaller. Inside each group: coins to accumulate (best Dip Report record) first, then coins you hold little of, then the deepest below its buy price; ties go T3, then T2, then T1.</li>
              <li><b>Shit list (Dip Report "Careful"):</b> last in line whatever their group, and never more than $50 in one buy. BTC, ETH and SOL are never on it.</li>
              <li><b>Selling:</b> a sale is at least ${info.rules.minSell} and the bot never sells a coin below what you paid for it.</li>
              <li><b>Only coins Swyftx lists and has switched on.</b> If Swyftx switches a coin off, the bot pauses it and retries.</li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default DailyLimit;
