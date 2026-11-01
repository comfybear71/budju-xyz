import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface CoinRow { coin: string; buys: number; sells: number; spent: number; heldValue: number; botPnl: number; holdPnl: number; edge: number; keepPnl: number; sellEffect: number; returnPct: number; holdReturnPct: number; priced: boolean }
interface Totals { coins: number; spent: number; heldValue: number; botPnl: number; holdPnl: number; edge: number; keepPnl: number; sellEffect: number; coinsSellsHelped: number; botReturnPct: number; holdReturnPct: number; coinsBeatHold: number; coinsLosing: number; verdict: string }
interface Card { coins: CoinRow[]; totals: Totals; scope: string; wallets: number; trades: number }

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const col = (n: number) => (n >= 0 ? "#4ade80" : "#f87171");

/** Admin: is the bot really beating "just buy and hold" with the same dollars? */
const Scorecard = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [data, setData] = useState<Card | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<"spent" | "sellEffect" | "botPnl">("sellEffect");

  const load = async (sc = scope) => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/scorecard?wallet=${wallet}&admin_wallet=${wallet}&scope=${sc}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Card);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !busy) void load();
  };

  const rows = [...(data?.coins ?? [])].filter((c) => c.priced).sort((a, b) => (sort === "spent" ? b.spent - a.spent : sort === "botPnl" ? b.botPnl - a.botPnl : a.sellEffect - b.sellEffect));
  const t = data?.totals;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📊 Scorecard — is the bot beating just holding?</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex gap-2 mb-2">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                onClick={() => { setScope(s); void load(s); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: scope === s ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: scope === s ? "#93c5fd" : "#94a3b8" }}
              >
                {s === "all" ? "Everyone" : "Admin only"}
              </button>
            ))}
            <button onClick={() => load()} disabled={busy} className="text-[11px] text-slate-400">{busy ? "Loading…" : "Refresh"}</button>
          </div>
          {failed && <div className="text-xs text-red-400 mb-2">Couldn't load the scorecard. Tap Refresh.</div>}
          {t && data && (
            <>
              <div className="rounded-lg px-3 py-2 mb-2" style={{ background: t.edge >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${t.edge >= 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                <div className="text-[12px] font-bold text-slate-100">{t.verdict}</div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {t.coins} coins · {data.trades.toLocaleString()} trades · {data.wallets} wallet{data.wallets === 1 ? "" : "s"}. Put in <b>{usd(t.spent)}</b>; now holding <b>{usd(t.heldValue)}</b>.
                  Bot P&amp;L <b style={{ color: col(t.botPnl) }}>{usd(t.botPnl)}</b>. The same buys <i>never sold</i> would be <b style={{ color: col(t.keepPnl) }}>{usd(t.keepPnl)}</b>;
                  all the money in on day one would be <b style={{ color: col(t.holdPnl) }}>{usd(t.holdPnl)}</b>.
                  Selling helped on <b>{t.coinsSellsHelped}</b> of {t.coins} coins; <b>{t.coinsLosing}</b> are in the red.
                </div>
              </div>
              <div className="flex gap-1.5 mb-1 text-[10px]">
                <span className="text-slate-500">Sort:</span>
                {([["sellEffect", "selling hurt most"], ["botPnl", "best P&L"], ["spent", "biggest"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSort(k)} style={{ color: sort === k ? "#e2e8f0" : "#64748b", fontWeight: sort === k ? 700 : 400 }}>{l}</button>
                ))}
              </div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="py-1 px-1">Coin</th><th className="px-1 text-right">Put in</th><th className="px-1 text-right">Bot P&amp;L</th>
                      <th className="px-1 text-right">No-sell P&amp;L</th><th className="px-1 text-right">Selling effect</th><th className="px-1 text-right">Day-one P&amp;L</th><th className="px-1 text-right">B/S</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.coin} className="border-t border-white/[0.05]" style={{ height: 28 }}>
                        <td className="px-1 font-bold text-slate-200">{c.coin}</td>
                        <td className="px-1 text-right font-mono text-slate-400">{usd(c.spent)}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(c.botPnl) }}>{usd(c.botPnl)}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(c.keepPnl) }}>{usd(c.keepPnl)}</td>
                        <td className="px-1 text-right font-mono font-bold" style={{ color: col(c.sellEffect) }}>{c.sellEffect >= 0 ? "+" : ""}{usd(c.sellEffect)}</td>
                        <td className="px-1 text-right font-mono text-slate-500">{usd(c.holdPnl)}</td>
                        <td className="px-1 text-right font-mono text-slate-500">{c.buys}/{c.sells}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                <b>No-sell P&amp;L</b> = the exact buys the bot made, at the same moments, but never sold. <b>Selling effect</b> = Bot − No-sell: green means taking profits helped, red means selling
                early cost you (the coin kept rising). <b>Day-one P&amp;L</b> = all the money in at once at the first buy price — a harsher test, because that much cash was never available at once.
                "Put in" counts recycled money more than once. Withdrawals are not trades, so they are not in this table. Uses recorded fill prices (older admin trades are estimates). Not financial advice.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Scorecard;
