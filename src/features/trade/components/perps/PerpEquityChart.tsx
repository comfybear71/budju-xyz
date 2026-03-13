import { useState } from "react";
import type { PerpEquitySnapshot } from "../../types/perps";

interface Props {
  data: PerpEquitySnapshot[];
  onPeriodChange: (period: string) => void;
}

const PerpEquityChart = ({ data, onPeriodChange }: Props) => {
  const [period, setPeriod] = useState("all");

  const handlePeriod = (p: string) => {
    setPeriod(p);
    onPeriodChange(p);
  };

  if (data.length < 2) {
    return (
      <div className="text-center py-8 text-slate-500 text-xs">
        Not enough data for equity curve yet. Positions are monitored every minute.
      </div>
    );
  }

  // Simple SVG line chart
  const equities = data.map((d) => d.equity);
  const minEq = Math.min(...equities) * 0.995;
  const maxEq = Math.max(...equities) * 1.005;
  const range = maxEq - minEq || 1;

  const width = 400;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((d.equity - minEq) / range) * chartH;
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  const isUp = equities[equities.length - 1] >= equities[0];
  const strokeColor = isUp ? "#34d399" : "#f87171";
  const fillColor = isUp ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)";

  // Area path
  const areaD = `${pathD} L ${padding.left + chartW},${padding.top + chartH} L ${padding.left},${padding.top + chartH} Z`;

  return (
    <div>
      {/* Period buttons */}
      <div className="flex gap-1 mb-2">
        {["1d", "1w", "1m", "all"].map((p) => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              period === p
                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline at $10K */}
        {10000 >= minEq && 10000 <= maxEq && (
          <line
            x1={padding.left}
            y1={padding.top + chartH - ((10000 - minEq) / range) * chartH}
            x2={padding.left + chartW}
            y2={padding.top + chartH - ((10000 - minEq) / range) * chartH}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="4,4"
          />
        )}

        {/* Area */}
        <path d={areaD} fill="url(#eqGrad)" />

        {/* Line */}
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.5" />

        {/* Labels */}
        <text x={padding.left + 2} y={padding.top + 8} className="text-[8px]" fill="#64748b">
          ${maxEq.toFixed(0)}
        </text>
        <text x={padding.left + 2} y={padding.top + chartH - 2} className="text-[8px]" fill="#64748b">
          ${minEq.toFixed(0)}
        </text>
      </svg>

      {/* Current equity */}
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-slate-500">
          {data.length} snapshots
        </span>
        <span className={isUp ? "text-emerald-400" : "text-red-400"}>
          ${equities[equities.length - 1].toFixed(2)}
        </span>
      </div>
    </div>
  );
};

export default PerpEquityChart;
