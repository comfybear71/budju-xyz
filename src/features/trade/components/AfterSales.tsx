import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { fetchAfterSales, type AfterSales } from "../services/tradeApi";

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const pc = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const col = (n: number | null | undefined) => (n == null ? "#64748b" : n >= 0 ? "#f59e0b" : "#4ade80");   // amber = price went UP after we sold

/** Admin: what did the price do after each real sale? Shows whether selling early costs money. */
const AfterSalesCard = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AfterSales | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [days, setDays] = useState(60);

  const load = async (d = days) => {
    setBusy(true);
    setFailed(false);
    const r = await fetchAfterSales(wallet, d);
    setData(r);
    setFailed(!r);
    setBusy(false);
  };
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !busy) void load();
  };

  const o = data?.overall;
  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📉 After-sale tracker — did selling early cost us?</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-slate-500">Sales in the last</span>
            {[30, 60, 120].map((d) => (
              <button key={d} onClick={() => { setDays(d); void load(d); }} className="px-2 py-1 rounded text-[11px] font-bold"
                style={{ background: days === d ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: days === d ? "#93c5fd" : "#94a3b8" }}>{d} days</button>
            ))}
            <button onClick={() => load()} disabled={busy} className="text-[11px] text-slate-400">{busy ? "Loading…" : "Refresh"}</button>
          </div>
          {failed && <div className="text-xs text-red-400">Couldn't load. Tap Refresh.</div>}
          {o && data && (
            <>
              <div className="rounded-lg px-3 py-2 mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="text-[12px] text-slate-200">
                  {o.sales} sales. A week later the price was <b style={{ color: col(o.avg7) }}>{pc(o.avg7)}</b> on average vs the sale price; higher in <b>{o.higher7}</b> of {o.n7} sales.
                  Holding those coins another 7 days would have been worth about <b style={{ color: col(o.worth7) }}>{usd(o.worth7)}</b> {o.worth7 >= 0 ? "more" : "less"}.
                </div>
                <div className="text-[10px] text-slate-500 mt-1">Amber = the price rose after we sold (selling early cost something). Green = it fell (selling was right). Two weeks later: {pc(o.avg14)} on average.</div>
              </div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left"><th className="py-1 px-1">Coin</th><th className="px-1 text-right">Sales</th><th className="px-1 text-right">+7d avg</th><th className="px-1 text-right">Higher</th><th className="px-1 text-right">Worth (7d)</th></tr>
                  </thead>
                  <tbody>
                    {data.coins.map((c) => (
                      <tr key={c.coin} className="border-t border-white/[0.05]" style={{ height: 28 }}>
                        <td className="px-1 font-bold text-slate-200">{c.coin}</td>
                        <td className="px-1 text-right font-mono text-slate-400">{c.sales}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(c.avg7) }}>{pc(c.avg7)}</td>
                        <td className="px-1 text-right font-mono text-slate-400">{c.higher7}/{c.n7}</td>
                        <td className="px-1 text-right font-mono" style={{ color: col(c.worth7) }}>{usd(c.worth7)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                "Worth (7d)" = quantity sold × the price change over the following 7 days, using daily prices. It only counts sales at least 7 days old. Not financial advice.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AfterSalesCard;
