import { useMemo, useState } from "react";
import { HiOutlineChartBar } from "react-icons/hi2";
import type { NavHistoryPoint } from "../services/tradeApi";

interface Props {
  points: NavHistoryPoint[];
}

const formatNav = (n: number) => `$${n.toFixed(4)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });

/**
 * Small public NAV-over-time chart — visible to every visitor, connected or
 * not, admin or not. Share price (NAV) is what deposits buy into: lower NAV
 * means more shares per dollar, and every existing share is worth more as
 * NAV rises. Built from the real NAV recorded on every deposit/withdrawal
 * (see fetchNavHistory) plus a live "now" point — sparse but real, not
 * interpolated.
 */
const PoolNavChart = ({ points }: Props) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const width = 400;
    const height = 90;
    const padding = { top: 14, right: 10, bottom: 16, left: 10 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const t0 = new Date(points[0].timestamp).getTime();
    const t1 = new Date(points[points.length - 1].timestamp).getTime();
    const tRange = Math.max(t1 - t0, 1);

    const navs = points.map((p) => p.nav);
    const minV = Math.min(...navs) * 0.98;
    const maxV = Math.max(...navs) * 1.02 || 1;
    const vRange = maxV - minV || 1;

    const xFor = (ts: string) =>
      padding.left + ((new Date(ts).getTime() - t0) / tRange) * chartW;
    const yFor = (v: number) => padding.top + chartH - ((v - minV) / vRange) * chartH;

    const linePoints = points.map((p) => ({ x: xFor(p.timestamp), y: yFor(p.nav), p }));
    const linePath = `M ${linePoints.map((v) => `${v.x},${v.y}`).join(" L ")}`;
    const areaPath = `${linePath} L ${linePoints[linePoints.length - 1].x},${padding.top + chartH} L ${linePoints[0].x},${padding.top + chartH} Z`;

    const first = points[0].nav;
    const last = points[points.length - 1].nav;
    const isUp = last >= first;

    return { width, height, padding, chartW, chartH, linePath, areaPath, linePoints, minV, maxV, isUp, first, last };
  }, [points]);

  if (!chart) return null;

  const { width, height, padding, isUp, linePath, areaPath, linePoints, minV, maxV, first, last } = chart;
  const strokeColor = isUp ? "#a855f7" : "#f87171";
  const changePct = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <HiOutlineChartBar className="w-3 h-3 text-purple-400/70" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400/60">
            Share Price (NAV) Over Time
          </span>
        </div>
        <span className={`text-[10px] font-bold font-mono ${isUp ? "text-purple-300" : "text-red-400"}`}>
          {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        onMouseLeave={() => setHovered(null)}
      >
        <defs>
          <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={areaPath} fill="url(#navGrad)" />
        <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="1.5" />

        {linePoints.map(({ x, y, p }, i) => (
          <g key={i} onMouseEnter={() => setHovered(i)} className="cursor-pointer">
            <circle cx={x} cy={y} r={hovered === i ? 5 : 3.5} fill="transparent" />
            <circle
              cx={x}
              cy={y}
              r={p.type === "now" ? 2.75 : 1.75}
              fill={p.type === "withdrawal" ? "#f59e0b" : p.type === "now" ? strokeColor : "#22d3ee"}
              stroke="#0f172a"
              strokeWidth="1"
            />
          </g>
        ))}

        <text x={padding.left + 2} y={padding.top + 7} className="text-[8px]" fill="#64748b">
          {formatNav(maxV)}
        </text>
        <text x={padding.left + 2} y={padding.top + chart.chartH - 1} className="text-[8px]" fill="#64748b">
          {formatNav(Math.max(minV, 0))}
        </text>
      </svg>

      <div className="h-5 mt-0.5">
        {hovered !== null ? (
          (() => {
            const p = points[hovered];
            return (
              <div className="flex items-center justify-between text-[10px] px-0.5">
                <span className="text-slate-400">
                  {formatDate(p.timestamp)}
                  {p.type === "deposit" ? " · deposit event" : p.type === "withdrawal" ? " · withdrawal event" : " · today"}
                </span>
                <span className="font-mono text-slate-300">{formatNav(p.nav)}</span>
              </div>
            );
          })()
        ) : (
          <div className="flex items-center justify-between text-[9px] px-0.5 text-slate-500">
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" /> Deposit
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" /> Withdrawal
              </span>
            </span>
            <span>{points.length} events</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoolNavChart;
