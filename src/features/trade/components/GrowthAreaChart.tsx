import { useMemo } from "react";
import type { PositionHistoryPoint } from "../services/tradeApi";

interface Props {
  points: PositionHistoryPoint[];
}

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

/**
 * Deliberately minimal — just one smooth filled area + line of value over
 * time, no second dashed "net invested" series, no per-event tick marks or
 * circle markers. Those made sense on the detailed per-wallet drill-down
 * (PositionHistoryChart, still used on the Leaderboard/WalletDetailPanel),
 * but summed across every deposit/withdrawal on EVERY connected wallet for
 * the home card's "Pool" view, that turned into a dense, unreadable comb of
 * vertical/horizontal dashes. This is the plain "nice slim area chart" the
 * home card actually asked for.
 *
 * Still built from the same points (see buildLiveCashFlowHistory /
 * buildCommunityCashFlowHistory) — every historical point's value is net
 * invested (deposited − withdrawn) at that moment, since there's no real
 * historical daily balance for a non-custodial account; only the final
 * "now" point uses today's real live total. The P&L label below the chart
 * is exactly that gap: live total − net invested, same number either view
 * would show on its own stat cards.
 */
const GrowthAreaChart = ({ points }: Props) => {
  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const width = 400;
    const height = 90;
    const padding = { top: 6, right: 4, bottom: 6, left: 4 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = new Date(points[0].timestamp).getTime();
    const t1 = new Date(points[points.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);

    const values = points.map((p) => p.value);
    const minV = Math.min(...values, 0) * 0.97;
    const maxV = Math.max(...values) * 1.05 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: string) => padding.left + ((new Date(ts).getTime() - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    const coords = points.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.value) }));
    const linePath = `M ${coords.map((c) => `${c.x},${c.y}`).join(" L ")}`;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x},${padding.top + chartH} L ${coords[0].x},${padding.top + chartH} Z`;

    const last = points[points.length - 1];
    const pnl = last.value + last.cumulativeWithdrawn - last.cumulativeDeposited;
    const isUp = pnl >= 0;

    return { linePath, areaPath, isUp, pnl, maxV, minV };
  }, [points]);

  if (!chart) {
    return (
      <div className="text-center py-4 text-slate-500 text-[11px]">
        Not enough deposit history yet to chart.
      </div>
    );
  }

  const { linePath, areaPath, isUp, pnl, maxV, minV } = chart;
  const color = isUp ? "#34d399" : "#f87171";

  return (
    <div>
      <svg viewBox="0 0 400 90" className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#growthGrad)" />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      </svg>

      <div className="flex items-center justify-between text-[10px] mt-1 px-0.5">
        <span className="text-slate-600">{formatUsd(Math.max(minV, 0))} – {formatUsd(maxV)}</span>
        <span className={`font-bold font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
          {pnl >= 0 ? "+" : ""}{formatUsd(pnl)}
        </span>
      </div>
    </div>
  );
};

export default GrowthAreaChart;
