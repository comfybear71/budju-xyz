import { useState, useEffect, useCallback } from "react";
import { scanAllMarkets, COLOR_MAP, type StrategyOpportunity } from "../../utils/strategyDetectors";

interface Props {
  onTrade: (opp: StrategyOpportunity) => void;
}

const SignalFeed = ({ onTrade }: Props) => {
  const [opportunities, setOpportunities] = useState<StrategyOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    const opps = await scanAllMarkets();
    setOpportunities(opps);
    setLoading(false);
  }, []);

  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, 60_000);
    return () => clearInterval(interval);
  }, [runScan]);

  if (loading && !opportunities.length) {
    return (
      <div className="p-4 text-center">
        <div className="text-[11px] text-slate-400 animate-pulse">Scanning strategies across all markets...</div>
      </div>
    );
  }

  if (!opportunities.length) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">No signals detected</span>
          <button onClick={runScan} className="text-[10px] px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25">
            Rescan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Signals ({opportunities.length})
        </h3>
        <button
          onClick={runScan}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-700/50 text-slate-400 hover:text-white border border-white/[0.05] transition-colors"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* Signal cards */}
      <div className="space-y-1.5 max-h-[60vh] lg:max-h-none overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {opportunities.map((opp, i) => {
          const colors = COLOR_MAP[opp.color] || COLOR_MAP.blue;
          const dirColor = opp.direction === "long" ? "text-emerald-400" : "text-red-400";
          const dirBg = opp.direction === "long" ? "bg-emerald-500/15 border-emerald-500/30" : "bg-red-500/15 border-red-500/30";
          const isExpanded = expandedIdx === i;

          return (
            <div
              key={`${opp.strategyKey}-${opp.market}-${i}`}
              className={`rounded-xl border ${colors.border} ${colors.bg} p-2.5 transition-all cursor-pointer hover:shadow-lg ${colors.glow}`}
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
            >
              {/* Top row */}
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-xs">{opp.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${colors.text}`}>
                  {opp.strategy}
                </span>
                <span className="text-[11px] text-white font-bold">{opp.base}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${dirBg} ${dirColor}`}>
                  {opp.direction.toUpperCase()}
                </span>
                <span className="text-[9px] text-slate-500">{opp.leverage}</span>

                {/* Hotness indicator */}
                <span className="ml-auto flex items-center gap-1">
                  <span className="w-8 h-1.5 rounded-full bg-slate-700 overflow-hidden inline-block">
                    <span
                      className={`block h-full rounded-full transition-all duration-700 ${
                        opp.hotness >= 80 ? "bg-red-400" : opp.hotness >= 60 ? "bg-orange-400" : opp.hotness >= 40 ? "bg-yellow-400" : "bg-slate-400"
                      }`}
                      style={{ width: `${opp.hotness}%` }}
                    />
                  </span>
                  <span className={`text-[8px] font-bold ${
                    opp.hotness >= 80 ? "text-red-400" : opp.hotness >= 60 ? "text-orange-400" : "text-slate-400"
                  }`}>
                    {opp.hotness}
                  </span>
                </span>
              </div>

              {/* Headline */}
              <div className="text-[10px] text-slate-200 mt-1 leading-relaxed">
                {opp.headline}
              </div>

              {/* Entry zone */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[9px]">
                <span className="text-slate-400">Entry: <span className="text-slate-300">{opp.entryZone}</span></span>
                <span className="text-slate-400">Conf: <span className={colors.text}>{opp.confidence}%</span></span>
              </div>

              {/* Expanded details + trade button */}
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-white/[0.05] space-y-1.5">
                  {opp.details.map((d, j) => (
                    <div key={j} className="text-[9px] text-slate-400 flex items-start gap-1.5">
                      <span className="text-slate-600 mt-px">•</span>
                      <span>{d}</span>
                    </div>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); onTrade(opp); }}
                    className={`w-full mt-2 py-2 rounded-lg text-[11px] font-bold transition-all border ${
                      opp.direction === "long"
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                        : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"
                    }`}
                  >
                    TRADE {opp.base} {opp.direction.toUpperCase()} @ {opp.leverage}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SignalFeed;
