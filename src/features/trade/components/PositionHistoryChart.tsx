import { useMemo, useState } from "react";
import { HiOutlineArrowTrendingUp } from "react-icons/hi2";
import type { PositionHistoryPoint } from "../services/tradeApi";

interface Props {
  points: PositionHistoryPoint[];
  /** Shown above the chart, e.g. "Your Position" or "Admin Position". */
  label?: string;
}

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });

const PositionHistoryChart = ({ points, label }: Props) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const width = 400;
    const height = 140;
    const padding = { top: 16, right: 10, bottom: 18, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = new Date(points[0].timestamp).getTime();
    const t1 = new Date(points[points.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);

    const allValues = points.flatMap((p) => [p.value, p.cumulativeDeposited]);
    const minV = Math.min(...allValues, 0) * 0.97;
    const maxV = Math.max(...allValues) * 1.05 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: string) =>
      padding.left + ((new Date(ts).getTime() - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    // "Deposited" is a step function: it jumps at each deposit and otherwise
    // holds flat — it should never visually slope between data points.
    const depositedStepPath: string[] = [];
    points.forEach((p, i) => {
      const x = xFor(p.timestamp);
      const y = yFor(p.cumulativeDeposited);
      if (i === 0) {
        depositedStepPath.push(`M ${x},${y}`);
      } else {
        const prevY = yFor(points[i - 1].cumulativeDeposited);
        depositedStepPath.push(`L ${x},${prevY} L ${x},${y}`);
      }
    });

    const valuePoints = points.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.value), p }));
    const valuePath = `M ${valuePoints.map((v) => `${v.x},${v.y}`).join(" L ")}`;
    const areaPath = `${valuePath} L ${valuePoints[valuePoints.length - 1].x},${padding.top + chartH} L ${valuePoints[0].x},${padding.top + chartH} Z`;

    const last = points[points.length - 1];
    const isUp = last.value >= last.cumulativeDeposited;

    return {
      width, height, padding, chartW, chartH,
      depositedStepPath: depositedStepPath.join(" "),
      valuePath, areaPath, valuePoints,
      minV, maxV, isUp,
    };
  }, [points]);

  if (!chart) {
    return (
      <div className="text-center py-6 text-slate-500 text-[11px]">
        Not enough deposit history yet to chart.
      </div>
    );
  }

  const { width, height, padding, chartW, isUp, depositedStepPath, valuePath, areaPath, valuePoints, minV, maxV } = chart;
  const strokeColor = isUp ? "#34d399" : "#f87171";
  const fillColor = isUp ? "#34d399" : "#f87171";
  const last = points[points.length - 1];
  const pnl = last.value - last.cumulativeDeposited;

  return (
    <div>
      {label && (
        <div className="flex items-center gap-2 mb-2">
          <HiOutlineArrowTrendingUp className="w-3 h-3 text-blue-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">{label}</span>
        </div>
      )}

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

        {/* Deposited step line (cost basis — never reduced by withdrawals) */}
        <path d={depositedStepPath} fill="none" stroke="#64748b" strokeWidth="1.25" strokeDasharray="3,3" />

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
            const p = points[hovered];
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
                <span className="w-2 h-[2px] bg-slate-500 inline-block" /> Deposited
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
