import { useEffect, useMemo, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { ASSET_CONFIG, PERMANENT_BUY_DENYLIST, isRetiredCoin, fetchDipReportLight, type DipCoin } from "../services/tradeApi";
import { TIER_CONFIG, type AutoTrader } from "../services/autoTrader";

interface Props {
  wallet: string;
  autoTrader: AutoTrader;
  assignments: Record<string, number[]>;
}

type Show = "all" | "in" | "out";

/** One row per coin with T1 / T2 / T3 switches — tap to turn a tier on or off. */
const CoinTierGrid = ({ wallet, autoTrader, assignments }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [perf, setPerf] = useState<Record<string, DipCoin>>({});

  // Last year's performance per coin per tier, from the stored Dip Report.
  useEffect(() => {
    if (!open || Object.keys(perf).length) return;
    void fetchDipReportLight(wallet).then((r) => {
      if (r) setPerf(Object.fromEntries(r.coins.map((c) => [c.coin, c])));
    });
  }, [open, wallet, perf]);

  const tierPerf = (coin: string, t: number) => {
    const tr = perf[coin]?.tiers?.[`t${t}` as "t1" | "t2" | "t3"];
    if (!tr || tr.buys === 0) return null;
    return { avg: tr.netPct / tr.buys, buys: tr.buys, open: tr.open };
  };

  const coins = useMemo(
    () =>
      Object.keys(ASSET_CONFIG)
        .filter((c) => !["USDC", "AUD", "USD"].includes(c) && !PERMANENT_BUY_DENYLIST.has(c) && (!isRetiredCoin(c) || (assignments[c] || []).length > 0))
        .filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()))
        .filter((c) => (show === "all" ? true : show === "in" ? (assignments[c] || []).length > 0 : (assignments[c] || []).length === 0))
        .sort(),
    [assignments, q, show],
  );

  const toggle = (coin: string, tier: number) => {
    if ((assignments[coin] || []).includes(tier)) autoTrader.unassignCoin(coin, tier);
    else autoTrader.assignCoin(coin, tier);
  };

  const setAll = (coin: string, on: boolean) => {
    for (const t of [1, 2, 3]) {
      const has = (assignments[coin] || []).includes(t);
      if (on && !has) autoTrader.assignCoin(coin, t);
      if (!on && has) autoTrader.unassignCoin(coin, t);
    }
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🎛 Coin tiers — tap to switch on or off</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex gap-2 mb-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a coin"
              className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-200 outline-none"
            />
            {(["all", "in", "out"] as Show[]).map((s) => (
              <button
                key={s}
                onClick={() => setShow(s)}
                className="px-2 rounded-lg text-[11px] font-bold"
                style={{ background: show === s ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)", color: show === s ? "#e2e8f0" : "#64748b" }}
              >
                {s === "all" ? "All" : s === "in" ? "In" : "Out"}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            {coins.map((c) => {
              const mine = assignments[c] || [];
              const color = ASSET_CONFIG[c]?.color || "#64748b";
              return (
                <div key={c} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                  <div className="w-16 min-w-0">
                    <div className="text-xs font-bold truncate" style={{ color }}>{c}</div>
                    {perf[c] && (
                      <div className="text-[9px] font-mono" style={{ color: perf[c].perBuy >= 0 ? "#22c55e" : "#ef4444" }}>
                        {perf[c].perBuy >= 0 ? "+" : ""}{perf[c].perBuy.toFixed(1)}%/buy
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3].map((t) => {
                      const on = mine.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggle(c, t)}
                          title={TIER_CONFIG[t]?.name}
                          className="w-12 h-10 rounded-lg text-[11px] font-bold transition-colors leading-tight"
                          style={{
                            background: on ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.05)",
                            border: `1px solid ${on ? "rgba(34,197,94,0.6)" : "rgba(255,255,255,0.08)"}`,
                            color: on ? "#4ade80" : "#475569",
                          }}
                        >
                          T{t}
                          {(() => {
                            const p = tierPerf(c, t);
                            return p ? (
                              <div className="text-[9px] font-mono" style={{ color: p.avg >= 0 ? "#22c55e" : "#ef4444" }}>
                                {p.avg >= 0 ? "+" : ""}{p.avg.toFixed(0)}%
                              </div>
                            ) : (
                              <div className="text-[9px] text-slate-600">·</div>
                            );
                          })()}
                        </button>
                      );
                    })}
                    <button onClick={() => setAll(c, mine.length < 3)} className="text-[10px] text-slate-500 w-9">
                      {mine.length < 3 ? "all" : "none"}
                    </button>
                  </div>
                </div>
              );
            })}
            {coins.length === 0 && <div className="text-xs text-slate-500 py-2">No coins match.</div>}
          </div>
          <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            Green button = traded in that tier. The small % is last year's average gain per dip bought in that tier (red = it lost). Changes save automatically and the bot picks them up on its next run (within 5 minutes).
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinTierGrid;
