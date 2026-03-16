import { useRef, useEffect } from "react";
import type { PerpMarket, PerpPosition } from "../../types/perps";

interface Props {
  markets: PerpMarket[];
  prices: Record<string, number>;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  positions: PerpPosition[];
  onClose?: () => void;
}

// Coin-specific colors for borders
const COIN_COLORS: Record<string, { border: string; selectedBg: string; selectedBorder: string; selectedText: string }> = {
  SOL:    { border: "border-purple-500/30",  selectedBg: "bg-purple-500/20",  selectedBorder: "border-purple-400/50",  selectedText: "text-purple-300" },
  BTC:    { border: "border-orange-500/30",  selectedBg: "bg-orange-500/20",  selectedBorder: "border-orange-400/50",  selectedText: "text-orange-300" },
  ETH:    { border: "border-blue-500/30",    selectedBg: "bg-blue-500/20",    selectedBorder: "border-blue-400/50",    selectedText: "text-blue-300" },
  DOGE:   { border: "border-yellow-500/30",  selectedBg: "bg-yellow-500/20",  selectedBorder: "border-yellow-400/50",  selectedText: "text-yellow-300" },
  AVAX:   { border: "border-red-500/30",     selectedBg: "bg-red-500/20",     selectedBorder: "border-red-400/50",     selectedText: "text-red-300" },
  LINK:   { border: "border-sky-500/30",     selectedBg: "bg-sky-500/20",     selectedBorder: "border-sky-400/50",     selectedText: "text-sky-300" },
  SUI:    { border: "border-cyan-500/30",    selectedBg: "bg-cyan-500/20",    selectedBorder: "border-cyan-400/50",    selectedText: "text-cyan-300" },
  RENDER: { border: "border-teal-500/30",    selectedBg: "bg-teal-500/20",    selectedBorder: "border-teal-400/50",    selectedText: "text-teal-300" },
  JUP:    { border: "border-emerald-500/30", selectedBg: "bg-emerald-500/20", selectedBorder: "border-emerald-400/50", selectedText: "text-emerald-300" },
};

const MarketPills = ({ markets, prices, selectedSymbol, onSelect, positions, onClose }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to selected pill on mount
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedSymbol]);

  // Count positions per market and sum live PnL
  const posCountMap: Record<string, number> = {};
  const posPnlMap: Record<string, number> = {};
  for (const p of positions) {
    posCountMap[p.symbol] = (posCountMap[p.symbol] || 0) + 1;
    const livePrice = prices[p.symbol] || p.mark_price;
    const delta = p.direction === "long" ? livePrice - p.mark_price : p.mark_price - livePrice;
    const livePnl = p.unrealized_pnl + (delta / p.entry_price) * p.size_usd;
    posPnlMap[p.symbol] = (posPnlMap[p.symbol] || 0) + livePnl;
  }

  return (
    <div className="flex items-center gap-1.5 py-2 px-3">
      <div
        ref={scrollRef}
        className="flex gap-1.5 overflow-x-auto flex-1 min-w-0 scrollbar-hide"
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {markets.map((m) => {
          const price = prices[m.symbol] || 0;
          const isSelected = m.symbol === selectedSymbol;
          const posCount = posCountMap[m.symbol] || 0;

          const coinColor = COIN_COLORS[m.base_asset];

          return (
            <button
              key={m.symbol}
              ref={isSelected ? selectedRef : undefined}
              onClick={() => onSelect(m.symbol)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border ${
                isSelected
                  ? `${coinColor?.selectedBg || "bg-blue-500/20"} ${coinColor?.selectedText || "text-blue-300"} ${coinColor?.selectedBorder || "border-blue-500/40"} shadow-lg`
                  : `bg-slate-800/40 text-slate-400 ${coinColor?.border || "border-white/[0.04]"} hover:bg-slate-800/60 hover:text-white`
              }`}
            >
              <span>{m.base_asset}</span>
              {price > 0 && (
                <span className={`tabular-nums ${isSelected ? "opacity-80" : "text-slate-500"}`}>
                  {price >= 1000
                    ? `$${(price / 1000).toFixed(1)}k`
                    : price >= 1
                      ? `$${price.toFixed(2)}`
                      : `$${price.toFixed(4)}`}
                </span>
              )}
              {posCount > 0 && (() => {
                const winning = (posPnlMap[m.symbol] || 0) >= 0;
                return (
                  <span className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center border ${
                    winning
                      ? "bg-emerald-500/30 text-emerald-400 border-emerald-500/40"
                      : "bg-red-500/30 text-red-400 border-red-500/40"
                  }`}>
                    {posCount}
                  </span>
                );
              })()}
            </button>
          );
        })}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all border bg-slate-800/40 text-slate-400 border-white/[0.06] hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/30"
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default MarketPills;
