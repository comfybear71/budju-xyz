import { useState, useEffect, useCallback } from "react";
import { scanAllMarkets, COLOR_MAP, type StrategyOpportunity } from "../../utils/strategyDetectors";

const StrategyMarquee = () => {
  const [opportunities, setOpportunities] = useState<StrategyOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<StrategyOpportunity | null>(null);

  const runScan = useCallback(async () => {
    try {
      const opps = await scanAllMarkets();
      setOpportunities(opps);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, 60_000);
    return () => clearInterval(interval);
  }, [runScan]);

  if (loading && !opportunities.length) {
    return (
      <div className="mx-3 mb-2 h-7 rounded-lg bg-slate-800/30 border border-white/[0.03] flex items-center px-3">
        <div className="text-[9px] text-slate-500 animate-pulse">Scanning strategies...</div>
      </div>
    );
  }

  if (!opportunities.length) return null;

  const handleClick = (opp: StrategyOpportunity) => {
    setExpanded(expanded?.market === opp.market && expanded?.strategyKey === opp.strategyKey ? null : opp);
  };

  // Very fast — 0.15s per item, minimum 2s total
  const duration = Math.max(opportunities.length * 0.15, 2);

  return (
    <div className="mx-3 mb-2">
      {/* Marquee strip — NEVER pauses, always scrolling */}
      <div className="relative overflow-hidden rounded-lg bg-slate-800/20 border border-white/[0.03]">
        <div
          className="flex whitespace-nowrap marquee-always-scroll"
          style={{ animationDuration: `${duration}s` }}
        >
          {/* Triple the items for seamless loop at high speed */}
          {[...opportunities, ...opportunities, ...opportunities].map((opp, i) => {
            const colors = COLOR_MAP[opp.color] || COLOR_MAP.blue;
            const dirColor = opp.direction === "long" ? "text-emerald-400" : "text-red-400";
            const isSelected = expanded?.market === opp.market && expanded?.strategyKey === opp.strategyKey;

            return (
              <button
                key={`${opp.market}-${opp.strategyKey}-${i}`}
                onClick={() => handleClick(opp)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 border-r border-white/[0.03] transition-colors flex-shrink-0 ${
                  isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-[10px]">{opp.icon}</span>
                <span className={`text-[9px] font-bold uppercase ${colors.text}`}>{opp.strategy}</span>
                <span className="text-[10px] font-bold text-slate-300">{opp.base}</span>
                <span className={`text-[9px] font-bold ${dirColor}`}>{opp.direction.toUpperCase()}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  opp.hotness >= 80 ? "bg-red-400" : opp.hotness >= 60 ? "bg-orange-400" : "bg-yellow-400"
                }`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded detail card */}
      {expanded && (() => {
        const colors = COLOR_MAP[expanded.color] || COLOR_MAP.blue;
        const dirColor = expanded.direction === "long" ? "text-emerald-400" : "text-red-400";
        const dirBg = expanded.direction === "long" ? "bg-emerald-500/15 border-emerald-500/30" : "bg-red-500/15 border-red-500/30";

        return (
          <div className={`mt-1.5 rounded-lg border ${colors.border} bg-slate-900/90 p-2.5 space-y-1.5 animate-in fade-in duration-200`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs">{expanded.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>{expanded.strategy}</span>
                <span className="text-[10px] text-slate-300 font-bold">{expanded.base}</span>
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${dirBg} ${dirColor}`}>
                  {expanded.direction.toUpperCase()}
                </span>
                <span className="text-[9px] text-slate-500">{expanded.leverage}</span>
                <span className="flex items-center gap-1">
                  <span className="w-8 h-1.5 rounded-full bg-slate-700 overflow-hidden inline-block">
                    <span
                      className={`block h-full rounded-full ${
                        expanded.hotness >= 80 ? "bg-red-400" : expanded.hotness >= 60 ? "bg-orange-400" : "bg-yellow-400"
                      }`}
                      style={{ width: `${expanded.hotness}%` }}
                    />
                  </span>
                  <span className={`text-[8px] font-bold ${
                    expanded.hotness >= 80 ? "text-red-400" : expanded.hotness >= 60 ? "text-orange-400" : "text-slate-400"
                  }`}>
                    {expanded.hotness >= 80 ? "HOT" : expanded.hotness >= 60 ? "WARM" : "MILD"}
                  </span>
                </span>
              </div>
              <button
                onClick={() => setExpanded(null)}
                className="text-slate-500 hover:text-white text-[10px] px-1"
              >
                ✕
              </button>
            </div>
            <div className="text-[10px] text-slate-200 font-medium">{expanded.headline}</div>
            <div className="space-y-0.5">
              {expanded.details.map((d, i) => (
                <div key={i} className="text-[9px] text-slate-400 flex items-start gap-1.5">
                  <span className="text-slate-600 mt-px">•</span>
                  <span>{d}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 text-[9px] pt-0.5">
              <span className="text-slate-400">Entry: <span className="text-slate-300">{expanded.entryZone}</span></span>
              <span className="text-slate-400">Confidence: <span className={colors.text}>{expanded.confidence}%</span></span>
            </div>
            <div className="text-[8px] text-slate-600 italic">Display only — not an active trade signal</div>
          </div>
        );
      })()}

      <style>{`
        .marquee-always-scroll {
          animation: marquee-scroll linear infinite;
          will-change: transform;
        }
        @keyframes marquee-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
};

export default StrategyMarquee;
