import { useRef, useEffect } from "react";
import type { PerpMarket, PerpPosition } from "../../types/perps";

interface Props {
  markets: PerpMarket[];
  prices: Record<string, number>;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  positions: PerpPosition[];
}

const MarketPills = ({ markets, prices, selectedSymbol, onSelect, positions }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to selected pill on mount
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedSymbol]);

  // Count positions per market
  const posCountMap: Record<string, number> = {};
  for (const p of positions) {
    posCountMap[p.symbol] = (posCountMap[p.symbol] || 0) + 1;
  }

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto py-2 px-3 scrollbar-hide"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
    >
      {markets.map((m) => {
        const price = prices[m.symbol] || 0;
        const isSelected = m.symbol === selectedSymbol;
        const posCount = posCountMap[m.symbol] || 0;

        return (
          <button
            key={m.symbol}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => onSelect(m.symbol)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
              isSelected
                ? "bg-blue-500/20 text-blue-300 border-blue-500/40 shadow-lg shadow-blue-500/10"
                : "bg-slate-800/40 text-slate-400 border-white/[0.04] hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            <span>{m.base_asset}</span>
            {price > 0 && (
              <span className={`tabular-nums ${isSelected ? "text-blue-200" : "text-slate-500"}`}>
                {price >= 1000
                  ? `$${(price / 1000).toFixed(1)}k`
                  : price >= 1
                    ? `$${price.toFixed(2)}`
                    : `$${price.toFixed(4)}`}
              </span>
            )}
            {posCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-emerald-500/30 text-emerald-400 text-[9px] flex items-center justify-center border border-emerald-500/40">
                {posCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default MarketPills;
