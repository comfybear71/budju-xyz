import { useEffect, useMemo, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { ASSET_CONFIG, PERMANENT_BUY_DENYLIST, isRetiredCoin, isNotOnSwyftx, fetchDipReportLight, fetchPaperTest, type DipCoin, type PaperTest, type PaperCoin } from "../services/tradeApi";
import { TIER_CONFIG, type AutoTrader } from "../services/autoTrader";

interface Props {
  wallet: string;
  autoTrader: AutoTrader;
  assignments: Record<string, number[]>;
}

type Show = "all" | "in" | "out";

const usd = (n: number | null | undefined) => (n == null ? "—" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const col = (n: number | null | undefined) => (n == null ? "#64748b" : n >= 0 ? "#4ade80" : "#f87171");
const pc = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

/** Tiny area chart: price or P&L over time. */
const Spark = ({ values, w = 96, h = 30 }: { values: number[]; w?: number; h?: number }) => {
  if (values.length < 2) return <span className="text-[9px] text-slate-600">collecting…</span>;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  const c = up ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polygon points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={c} fillOpacity="0.18" />
      <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth="1.4" />
    </svg>
  );
};

const CALL_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  core: { label: "⭐ Core", color: "#facc15", bg: "rgba(250,204,21,0.14)" },
  keep: { label: "✅ Keep", color: "#4ade80", bg: "rgba(34,197,94,0.12)" },
  off: { label: "🔻 Would switch off", color: "#f87171", bg: "rgba(239,68,68,0.15)" },
  on: { label: "🔺 Would switch on", color: "#38bdf8", bg: "rgba(56,189,248,0.15)" },
};

/** One row per coin with T1 / T2 / T3 switches — tap to turn a tier on or off. */
const CoinTierGrid = ({ wallet, autoTrader, assignments }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [perf, setPerf] = useState<Record<string, DipCoin>>({});
  const [paper, setPaper] = useState<PaperTest | null>(null);
  const [paperBusy, setPaperBusy] = useState(false);

  useEffect(() => {
    if (!open || paper) return;
    void fetchPaperTest(wallet).then((r) => r && setPaper(r));
  }, [open, wallet, paper]);

  const snapshotNow = async () => {
    setPaperBusy(true);
    const r = await fetchPaperTest(wallet, true);
    if (r) setPaper(r);
    setPaperBusy(false);
  };

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
        .filter((c) => !["USDC", "AUD", "USD"].includes(c) && !PERMANENT_BUY_DENYLIST.has(c) && !isNotOnSwyftx(c) && (!isRetiredCoin(c) || (assignments[c] || []).length > 0))
        .filter((c) => c.toLowerCase().includes(q.trim().toLowerCase()))
        .filter((c) => (show === "all" ? true : show === "in" ? (assignments[c] || []).length > 0 : (assignments[c] || []).length === 0))
        .sort(),
    [assignments, q, show],
  );

  const toggle = (coin: string, tier: number) => {
    if ((assignments[coin] || []).includes(tier)) autoTrader.unassignCoin(coin, tier);
    else if (!isNotOnSwyftx(coin)) autoTrader.assignCoin(coin, tier);   // never switch ON a coin Swyftx doesn't list
  };

  const setAll = (coin: string, on: boolean) => {
    for (const t of [1, 2, 3]) {
      const has = (assignments[coin] || []).includes(t);
      if (on && !has && !isNotOnSwyftx(coin)) autoTrader.assignCoin(coin, t);
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
          {(() => {
            const stuck = Object.keys(assignments).filter((c) => (assignments[c] || []).length > 0 && isNotOnSwyftx(c));
            return stuck.length > 0 ? (
              <div className="rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.35)" }}>
                <span className="text-[11px] text-red-200">
                  ⛔ {stuck.join(", ")} {stuck.length === 1 ? "is" : "are"} in your tiers but Swyftx doesn't list {stuck.length === 1 ? "it" : "them"}, so orders fail.
                </span>
                <button
                  onClick={() => stuck.forEach((c) => autoTrader.unassignCoin(c))}
                  className="text-[11px] font-bold px-2 py-1 rounded bg-red-500/30 text-red-100 flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : null;
          })()}
          <div className="rounded-lg px-3 py-2 mb-2" style={{ background: "rgba(56,189,248,0.07)", border: "1px solid rgba(56,189,248,0.25)" }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-sky-300">
                🧪 Paper test{paper?.started ? ` — week ${paper.week} of ${paper.weeks}${paper.complete ? " (complete)" : ""}` : " — not started"}
              </div>
              <button onClick={snapshotNow} disabled={paperBusy} className="text-[10px] font-bold px-2 py-1 rounded bg-white/10 text-slate-200 disabled:opacity-40">
                {paperBusy ? "Saving…" : paper?.started ? "Snapshot now" : "Start the test"}
              </button>
            </div>
            <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Nothing here changes what the bot trades. Each day every coin's numbers are saved; each week the rules say which coins they <i>would</i> switch off or on.
              Swipe the table sideways for the numbers and charts.
              {paper?.started && (
                <>
                  {" "}Started {paper.started}, ends {paper.ends}. Would switch off: <b className="text-red-300">{paper.off.length ? paper.off.join(", ") : "none yet"}</b>. Would switch on: <b className="text-sky-300">{paper.on.length ? paper.on.join(", ") : "none yet"}</b>.
                </>
              )}
            </div>
          </div>
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
          <div className="overflow-x-auto -mx-3 px-3 pb-1">
          <div className="space-y-1" style={{ minWidth: 1180 }}>
            <div className="flex items-center gap-2 px-2 text-[9px] uppercase tracking-wider text-slate-500 font-bold">
              <div style={{ width: 306 }} className="sticky left-0 z-10 bg-[#0f172a]">Coin · tiers</div>
              <div style={{ width: 150 }}>Paper call</div>
              <div style={{ width: 70 }} className="text-right">Year /dip</div>
              <div style={{ width: 70 }} className="text-right">90d /dip</div>
              <div style={{ width: 70 }} className="text-right">Bot P&amp;L</div>
              <div style={{ width: 80 }} className="text-right">If switched off</div>
              <div style={{ width: 100 }}>Price 90d</div>
              <div style={{ width: 100 }}>P&amp;L since start</div>
            </div>
            {coins.map((c) => {
              const mine = assignments[c] || [];
              const color = ASSET_CONFIG[c]?.color || "#64748b";
              const pt: PaperCoin | undefined = paper?.coins?.[c];
              const cs = pt ? CALL_STYLE[pt.call] : null;
              return (
                <div key={c} className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                  <div style={{ width: 306 }} className="sticky left-0 z-10 flex items-center justify-between gap-2 bg-[#141c2e] rounded-lg pr-1">
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
                  <div style={{ width: 150 }}>
                    {cs ? (
                      <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ color: cs.color, background: cs.bg }}>{cs.label}</span>
                    ) : <span className="text-[10px] text-slate-600">—</span>}
                    {pt && pt.weeksWeak > 0 && pt.call !== "off" && <div className="text-[9px] text-amber-400">weak {pt.weeksWeak} wk</div>}
                  </div>
                  <div style={{ width: 70 }} className="text-right font-mono text-[11px]"><span style={{ color: col(pt?.yearPerBuy) }}>{pc(pt?.yearPerBuy)}</span></div>
                  <div style={{ width: 70 }} className="text-right font-mono text-[11px]"><span style={{ color: col(pt?.per90) }}>{pc(pt?.per90)}</span></div>
                  <div style={{ width: 70 }} className="text-right font-mono text-[11px]"><span style={{ color: col(pt?.botPnl) }}>{usd(pt?.botPnl)}</span></div>
                  <div style={{ width: 80 }} className="text-right font-mono text-[11px]">
                    <span style={{ color: pt?.whatIfOff == null ? "#64748b" : pt.whatIfOff <= 0 ? "#4ade80" : "#f87171" }}>{usd(pt?.whatIfOff)}</span>
                  </div>
                  <div style={{ width: 100 }}>{pt ? <Spark values={pt.priceSeries} /> : null}</div>
                  <div style={{ width: 100 }}>{pt ? <Spark values={pt.pnlSeries.map((x) => x[1])} /> : null}</div>
                </div>
              );
            })}
            {coins.length === 0 && <div className="text-xs text-slate-500 py-2">No coins match.</div>}
          </div>
          </div>
          <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            Green button = traded in that tier. The small % is last year's average gain per dip bought in that tier (red = it lost). <b>If switched off</b> = the result of buys made since the rules would have switched the coin off: green/negative means switching off would have saved that much, red/positive means it would have cost that much in missed gains. Changes save automatically and the bot picks them up on its next run (within 5 minutes).
          </div>
        </div>
      )}
    </div>
  );
};

export default CoinTierGrid;
