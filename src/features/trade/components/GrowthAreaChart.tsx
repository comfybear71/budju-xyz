import { useMemo, useState } from "react";
import { sliceToPeriod, type PositionHistoryPoint } from "../services/tradeApi";

interface Props {
  points: PositionHistoryPoint[];
}

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

// No 24h option — unlike the coin price chart, these points are one-per-
// deposit/withdrawal-event (not a continuous feed), so a 24h window would
// almost always just show the single "now" point with nothing to chart.
const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
] as const;

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
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1); // default 90d — widest window, matches the old always-show-everything behaviour for history shorter than 90 days

  const windowedPoints = useMemo(
    () => sliceToPeriod(points, PERIODS[periodIdx].days),
    [points, periodIdx],
  );

  const chart = useMemo(() => {
    if (windowedPoints.length < 2) return null;

    const width = 400;
    const height = 90;
    const padding = { top: 6, right: 4, bottom: 6, left: 4 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = new Date(windowedPoints[0].timestamp).getTime();
    const t1 = new Date(windowedPoints[windowedPoints.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);

    const values = windowedPoints.map((p) => p.value);
    const minV = Math.min(...values, 0) * 0.97;
    const maxV = Math.max(...values) * 1.05 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: string) => padding.left + ((new Date(ts).getTime() - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    const coords = windowedPoints.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.value) }));
    const linePath = `M ${coords.map((c) => `${c.x},${c.y}`).join(" L ")}`;
    const areaPath = `${linePath} L ${coords[coords.length - 1].x},${padding.top + chartH} L ${coords[0].x},${padding.top + chartH} Z`;

    const last = windowedPoints[windowedPoints.length - 1];
    const pnl = last.value + last.cumulativeWithdrawn - last.cumulativeDeposited;
    const isUp = pnl >= 0;

    return { linePath, areaPath, isUp, pnl, maxV, minV };
  }, [windowedPoints]);

  const periodTabs = (
    <div className="flex items-center justify-end gap-1 mb-1.5">
      {PERIODS.map((p, i) => (
        <button
          key={p.label}
          onClick={() => setPeriodIdx(i)}
          className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold transition-colors ${
            i === periodIdx
              ? "bg-blue-500/15 text-blue-400"
              : "text-slate-600 hover:text-slate-400"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  if (points.length < 2) {
    return (
      <div className="text-center py-4 text-slate-500 text-[11px]">
        Not enough deposit history yet to chart.
      </div>
    );
  }

  if (!chart) {
    return (
      <div>
        {periodTabs}
        <div className="text-center py-4 text-slate-500 text-[11px]">
          No deposit history in this window yet.
        </div>
      </div>
    );
  }

  const { linePath, areaPath, isUp, pnl, maxV, minV } = chart;
  const color = isUp ? "#34d399" : "#f87171";

  return (
    <div>
      {periodTabs}
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
