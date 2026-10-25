import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  fetchCoinPriceHistory,
  type CommunityAggregateHoldings,
} from "../services/tradeApi";

interface Props {
  code: string;
  priceUsd: number;
  isAdmin: boolean;
  /** Already-fetched (or still-loading) admin aggregate holdings, lifted up
   *  to HoldingsList so every card expansion shares ONE fetch instead of
   *  each card re-triggering its own "iterate every wallet's Swyftx
   *  account" call — that endpoint is expensive and admin-only. */
  aggregateHoldings: CommunityAggregateHoldings | null;
  aggregateLoading: boolean;
}

const PERIODS = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
] as const;

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : n >= 1
      ? `$${n.toFixed(2)}`
      : `$${n.toFixed(6)}`;

const formatBalance = (n: number) => {
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.001) return n.toFixed(4);
  return n.toFixed(8);
};

/** Inline SVG area chart — same minimal pattern as GrowthAreaChart, just
 *  fed CoinGecko price points instead of cash-flow history. Scales to its
 *  container width via viewBox rather than scrolling horizontally; a
 *  7-30 day line has far fewer points than a tick-by-tick feed, so a
 *  fixed-width scroll area would mostly just be empty space. */
const PriceAreaChart = ({ points }: { points: { timestamp: number; priceUsd: number }[] }) => {
  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const width = 400;
    const height = 80;
    const padding = { top: 6, right: 4, bottom: 6, left: 4 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = points[0].timestamp;
    const t1 = points[points.length - 1].timestamp;
    const tRange = Math.max(t1 - t0, 1);

    const values = points.map((p) => p.priceUsd);
    const minV = Math.min(...values) * 0.98;
    const maxV = Math.max(...values) * 1.02 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: number) => padding.left + ((ts - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    const coords = points.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.priceUsd) }));
    const linePath = `M ${coords.map((c) => `${c.x},${c.y}`).join(" L ")}`;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x},${padding.top + chartH} L ${coords[0].x},${padding.top + chartH} Z`;

    const first = points[0].priceUsd;
    const last = points[points.length - 1].priceUsd;
    const isUp = last >= first;
    const pct = first > 0 ? ((last - first) / first) * 100 : 0;

    return { linePath, areaPath, isUp, pct, minV, maxV };
  }, [points]);

  if (!chart) {
    return (
      <div className="text-center py-4 text-slate-500 text-[11px]">
        Not enough price history yet to chart.
      </div>
    );
  }

  const { linePath, areaPath, isUp, pct, minV, maxV } = chart;
  const color = isUp ? "#34d399" : "#f87171";

  return (
    <div>
      <svg viewBox="0 0 400 80" className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`coinChartGrad-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#coinChartGrad-${color})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex items-center justify-between text-[10px] mt-1 px-0.5">
        <span className="text-slate-600">{formatUsd(minV)} – {formatUsd(maxV)}</span>
        <span className={`font-bold font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
          {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
};

const CoinExpandPanel = ({ code, priceUsd, isAdmin, aggregateHoldings, aggregateLoading }: Props) => {
  const [periodIdx, setPeriodIdx] = useState(1); // default 7d
  const [points, setPoints] = useState<{ timestamp: number; priceUsd: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const days = PERIODS[periodIdx].days;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCoinPriceHistory(code, days).then((history) => {
      if (cancelled) return;
      setPoints(history.points);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [code, days]);

  // Per-wallet holders of this specific coin, sorted by amount desc —
  // admin-only, since aggregate-holdings iterates every wallet's own key.
  const holders = useMemo(() => {
    if (!aggregateHoldings) return [];
    return aggregateHoldings.perWallet
      .map((w) => ({ wallet: w.walletAddress, amount: w.holdings[code] || 0 }))
      .filter((w) => w.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [aggregateHoldings, code]);

  const totalHeld = holders.reduce((s, h) => s + h.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="mt-2 pt-3 border-t border-white/[0.06] space-y-4">
        {/* Price history chart */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-gray-600">
              Price History
            </span>
            <div className="flex gap-1">
              {PERIODS.map((p, i) => (
                <button
                  key={p.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPeriodIdx(i);
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                    i === periodIdx
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-slate-600 hover:text-slate-400"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="text-center py-4 text-slate-500 text-[11px] animate-pulse">Loading chart…</div>
          ) : (
            <PriceAreaChart points={points} />
          )}
        </div>

        {/* Per-wallet breakdown (admin only) */}
        {isAdmin && (
          <div>
            <span className="text-[10px] uppercase tracking-[0.12em] font-bold text-gray-600 mb-2 block">
              Holders
            </span>
            {aggregateLoading ? (
              <div className="text-center py-3 text-slate-500 text-[11px] animate-pulse">Loading holders…</div>
            ) : holders.length === 0 ? (
              <div className="text-center py-3 text-slate-500 text-[11px]">No connected wallets hold {code}</div>
            ) : (
              <div className="space-y-1.5">
                {holders.map((h) => {
                  const short = h.wallet.length > 8 ? `${h.wallet.slice(0, 4)}...${h.wallet.slice(-4)}` : h.wallet;
                  const pctOfTotal = totalHeld > 0 ? (h.amount / totalHeld) * 100 : 0;
                  return (
                    <div key={h.wallet} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-slate-400">{short}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500">{formatBalance(h.amount)} {code}</span>
                        <span className="font-mono text-slate-300 font-bold w-14 text-right">
                          {formatUsd(h.amount * priceUsd)}
                        </span>
                        <span className="font-mono text-slate-600 w-10 text-right">{pctOfTotal.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CoinExpandPanel;
