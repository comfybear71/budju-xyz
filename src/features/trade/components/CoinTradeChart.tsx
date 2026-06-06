import { useMemo } from "react";
import type { CoinTradePoint } from "../services/tradeApi";

interface Props {
  trades: CoinTradePoint[];
  avgCost: number;
  currentPrice: number;
  height?: number;
}

const fmtPrice = (n: number) => {
  if (!n || isNaN(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
};

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short" });

/**
 * Scatter of actual buy (green) / sell (red) trades over time, with the
 * average-cost line and current price overlaid. SVG draws the lines + path
 * (preserveAspectRatio none); dots are HTML so they stay perfectly round.
 */
const CoinTradeChart = ({ trades, avgCost, currentPrice, height = 150 }: Props) => {
  const model = useMemo(() => {
    const pts = trades
      .map((tr) => ({ ...tr, ms: new Date(tr.t).getTime() }))
      .filter((tr) => !isNaN(tr.ms) && tr.price > 0)
      .sort((a, b) => a.ms - b.ms);
    if (pts.length === 0) return null;

    const tMin = pts[0].ms;
    const tMax = Math.max(pts[pts.length - 1].ms, Date.now());
    const tSpan = tMax - tMin || 1;

    const prices = pts.map((p) => p.price);
    if (avgCost > 0) prices.push(avgCost);
    if (currentPrice > 0) prices.push(currentPrice);
    let pMin = Math.min(...prices);
    let pMax = Math.max(...prices);
    const pad = (pMax - pMin) * 0.08 || pMax * 0.05 || 1;
    pMin -= pad;
    pMax += pad;
    const pSpan = pMax - pMin || 1;

    const x = (ms: number) => ((ms - tMin) / tSpan) * 100;
    const y = (p: number) => (1 - (p - pMin) / pSpan) * 100;

    const dots = pts.map((p) => ({ left: x(p.ms), top: y(p.price), side: p.side, price: p.price }));
    const path = pts.map((p) => `${x(p.ms).toFixed(2)},${y(p.price).toFixed(2)}`).join(" ");

    return {
      dots,
      path,
      avgY: avgCost > 0 ? y(avgCost) : null,
      curY: currentPrice > 0 ? y(currentPrice) : null,
      tMin,
      tMax,
      pMin: pMin + pad,
      pMax: pMax - pad,
    };
  }, [trades, avgCost, currentPrice]);

  if (!model) {
    return (
      <div className="text-[10px] text-slate-600 text-center py-6">No trade points to chart.</div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-1.5 text-[9px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} /> Buy</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} /> Sell</span>
        <span className="flex items-center gap-1"><span className="w-3 h-px" style={{ background: "#f59e0b", borderTop: "1px dashed #f59e0b" }} /> Avg cost</span>
        <span className="flex items-center gap-1"><span className="w-3 h-px" style={{ background: "#2dd4bf" }} /> Now</span>
      </div>

      <div className="relative w-full rounded-lg overflow-hidden" style={{ height, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        {/* Max / min price labels */}
        <span className="absolute left-1.5 top-1 text-[9px] font-mono text-slate-600 z-10">{fmtPrice(model.pMax)}</span>
        <span className="absolute left-1.5 bottom-1 text-[9px] font-mono text-slate-600 z-10">{fmtPrice(model.pMin)}</span>

        {/* SVG layer: price path + avg-cost + current lines */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points={model.path} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          {model.avgY != null && (
            <line x1="0" y1={model.avgY} x2="100" y2={model.avgY} stroke="#f59e0b" strokeWidth="0.6" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
          )}
          {model.curY != null && (
            <line x1="0" y1={model.curY} x2="100" y2={model.curY} stroke="#2dd4bf" strokeWidth="0.6" strokeDasharray="1 1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>

        {/* HTML dots (stay round) */}
        {model.dots.map((d, i) => (
          <div
            key={i}
            title={`${d.side} @ ${fmtPrice(d.price)}`}
            className="absolute rounded-full"
            style={{
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: 6,
              height: 6,
              transform: "translate(-50%, -50%)",
              background: d.side === "sell" ? "#ef4444" : "#22c55e",
              border: "1px solid rgba(10,10,26,0.6)",
              boxShadow: `0 0 4px ${d.side === "sell" ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)"}`,
            }}
          />
        ))}
      </div>

      {/* Time axis */}
      <div className="flex justify-between mt-1 text-[9px] font-mono text-slate-600">
        <span>{fmtDate(model.tMin)}</span>
        <span>now</span>
      </div>
    </div>
  );
};

export default CoinTradeChart;
