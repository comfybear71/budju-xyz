import { useMemo, useState } from "react";
import { HiOutlineArrowTrendingUp } from "react-icons/hi2";
import { sliceToPeriod, type PositionHistoryPoint } from "../services/tradeApi";

interface Props {
  points: PositionHistoryPoint[];
  /** Shown above the chart, e.g. "Your Position" or "Admin Position". */
  label?: string;
}

const PERIODS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "120d", days: 120 },
] as const;

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });

const PositionHistoryChart = ({ points, label }: Props) => {
  const [hovered, setHovered] = useState<number | null>(null);
  // Default to the widest window (120d) — closest to the old always-show-
  // everything behavior for any wallet whose whole history fits inside it.
  const [periodIdx, setPeriodIdx] = useState(PERIODS.length - 1);

  const windowedPoints = useMemo(
    () => sliceToPeriod(points, PERIODS[periodIdx].days),
    [points, periodIdx],
  );

  const chart = useMemo(() => {
    const points = windowedPoints;
    if (points.length < 2) return null;

    const width = 400;
    const height = 140;
    const padding = { top: 16, right: 10, bottom: 18, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = new Date(points[0].timestamp).getTime();
    const t1 = new Date(points[points.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);

    // "Net invested" = cumulativeDeposited - cumulativeWithdrawn — this is
    // what's actually still "at risk" in the pool right now. cumulativeDeposited
    // alone is a lifetime-gross figure that never drops on a withdrawal, which
    // made the dashed line stay pinned at its peak forever and made a
    // withdrawal invisible on the chart. Net invested drops the moment money
    // comes back out, so the visual gap to the value line IS the P&L.
    const netInvestedOf = (p: PositionHistoryPoint) => p.cumulativeDeposited - p.cumulativeWithdrawn;

    const allValues = points.flatMap((p) => [p.value, netInvestedOf(p)]);
    const minV = Math.min(...allValues, 0) * 0.97;
    const maxV = Math.max(...allValues) * 1.05 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: string) =>
      padding.left + ((new Date(ts).getTime() - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    // Net invested is a step function: it jumps at each deposit/withdrawal and
    // otherwise holds flat — it should never visually slope between events.
    const investedStepPath: string[] = [];
    points.forEach((p, i) => {
      const x = xFor(p.timestamp);
      const y = yFor(netInvestedOf(p));
      if (i === 0) {
        investedStepPath.push(`M ${x},${y}`);
      } else {
        const prevY = yFor(netInvestedOf(points[i - 1]));
        investedStepPath.push(`L ${x},${prevY} L ${x},${y}`);
      }
    });

    const valuePoints = points.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.value), p }));
    const valuePath = `M ${valuePoints.map((v) => `${v.x},${v.y}`).join(" L ")}`;
    const areaPath = `${valuePath} L ${valuePoints[valuePoints.length - 1].x},${padding.top + chartH} L ${valuePoints[0].x},${padding.top + chartH} Z`;

    // Vertical ticks at every withdrawal event so a cash-out reads as an
    // explicit annotation on the timeline, not just an unexplained dip.
    const withdrawalTicks = valuePoints
      .filter(({ p }) => p.type === "withdrawal")
      .map(({ x }) => ({ x, y1: padding.top, y2: padding.top + chartH }));

    // P&L must add back anything already withdrawn — cumulativeDeposited is
    // a lifetime gross figure that a withdrawal never reduces, so comparing
    // it straight against the remaining value makes a withdrawal look like
    // a loss instead of realized value.
    const last = points[points.length - 1];
    const isUp = last.value + last.cumulativeWithdrawn >= last.cumulativeDeposited;

    return {
      width, height, padding, chartW, chartH,
      investedStepPath: investedStepPath.join(" "),
      valuePath, areaPath, valuePoints, withdrawalTicks,
      minV, maxV, isUp,
    };
  }, [windowedPoints]);

  const periodTabs = (
    <div className="flex items-center justify-end gap-1 mb-1.5">
      {PERIODS.map((p, i) => (
        <button
          key={p.label}
          onClick={() => {
            setPeriodIdx(i);
            setHovered(null); // avoid pointing at a stale index from the previous window's point count
          }}
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
      <div className="text-center py-6 text-slate-500 text-[11px]">
        Not enough deposit history yet to chart.
      </div>
    );
  }

  if (!chart) {
    return (
      <div>
        {label && (
          <div className="flex items-center gap-2 mb-2">
            <HiOutlineArrowTrendingUp className="w-3 h-3 text-blue-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">{label}</span>
          </div>
        )}
        {periodTabs}
        <div className="text-center py-6 text-slate-500 text-[11px]">
          No deposit history in this window yet.
        </div>
      </div>
    );
  }

  const { width, height, padding, chartW, isUp, investedStepPath, valuePath, areaPath, valuePoints, withdrawalTicks, minV, maxV } = chart;
  const strokeColor = isUp ? "#34d399" : "#f87171";
  const fillColor = isUp ? "#34d399" : "#f87171";
  const last = windowedPoints[windowedPoints.length - 1];
  const pnl = last.value + last.cumulativeWithdrawn - last.cumulativeDeposited;

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineArrowTrendingUp className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">{label}</span>
        </div>
      )}

      {periodTabs}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Value area + line */}
        <path d={areaPath} fill="url(#posGrad)" />
        <path d={valuePath} fill="none" stroke={strokeColor} strokeWidth="1.75" />

        {/* Net invested step line (deposited minus withdrawn — drops on a withdrawal) */}
        <path d={investedStepPath} fill="none" stroke="#64748b" strokeWidth="1.25" strokeDasharray="3,3" />

        {/* Vertical annotation at each withdrawal — makes a cash-out explicit
            on the timeline instead of just an unlabelled dip in the lines. */}
        {withdrawalTicks.map((t, i) => (
          <line
            key={`wtick-${i}`}
            x1={t.x} x2={t.x} y1={t.y1} y2={t.y2}
            stroke="#f59e0b" strokeWidth="1" strokeDasharray="2,2" opacity={0.4}
          />
        ))}

        {/* Event markers */}
        {valuePoints.map(({ x, y, p }, i) => (
          <g
            key={i}
            onMouseEnter={() => setHovered(i)}
            className="cursor-pointer"
          >
            <circle cx={x} cy={y} r={hovered === i ? 5 : 3.5} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={p.type === "now" ? 3 : 2.25}
              fill={p.type === "withdrawal" ? "#f59e0b" : p.type === "now" ? strokeColor : "#22d3ee"}
              stroke="#0f172a"
              strokeWidth="1"
            />
          </g>
        ))}

        {/* Axis labels */}
        <text x={padding.left + 2} y={padding.top + 8} className="text-[8px]" fill="#64748b">
          {formatUsd(maxV)}
        </text>
        <text x={padding.left + 2} y={padding.top + chart.chartH - 2} className="text-[8px]" fill="#64748b">
          {formatUsd(Math.max(minV, 0))}
        </text>
      </svg>

      {/* Hover detail */}
      <div className="h-8">
        {hovered !== null ? (
          (() => {
            const p = windowedPoints[hovered];
            return (
              <div className="flex items-center justify-between text-[10px] px-0.5">
                <span className="text-slate-400">
                  {formatDate(p.timestamp)}
                  {p.type === "deposit" && p.amount ? ` · +${formatUsd(p.amount)} deposit` : ""}
                  {p.type === "withdrawal" && p.amount ? ` · −${formatUsd(p.amount)} withdrawal` : ""}
                  {p.type === "now" ? " · today" : ""}
                </span>
                <span className="font-mono text-slate-300">{formatUsd(p.value)}</span>
              </div>
            );
          })()
        ) : (
          <div className="flex items-center justify-between text-[10px] px-0.5">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="w-2 h-[2px] bg-slate-500 inline-block" /> Net Invested
              </span>
              <span className="flex items-center gap-1" style={{ color: strokeColor }}>
                <span className="w-2 h-[2px] inline-block" style={{ backgroundColor: strokeColor }} /> Value
              </span>
            </span>
            <span className={`font-bold font-mono ${isUp ? "text-green-400" : "text-red-400"}`}>
              {pnl >= 0 ? "+" : ""}{formatUsd(pnl)}
            </span>
          </div>
        )}
      </div>
      <div className="flex justify-end" style={{ width: `${(chartW / width) * 100}%` }} />
    </div>
  );
};

export default PositionHistoryChart;
