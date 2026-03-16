import { useState } from "react";
import type { PerpPosition } from "../../types/perps";
import { partialClosePosition, pyramidPosition, flipPosition } from "../../services/perpApi";

interface Props {
  positions: PerpPosition[];
  prices: Record<string, number>;
  wallet: string | undefined;
  onClose: (positionId: string, exitPrice: number) => Promise<void>;
  onModify: (positionId: string, mods: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number }) => Promise<void>;
  onViewChart: (symbol: string) => void;
  onRefresh: () => void;
}

const PositionsStrip = ({ positions, prices, wallet, onClose, onModify, onViewChart, onRefresh }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [closePct, setClosePct] = useState(50);
  const [pyramidSize, setPyramidSize] = useState(50);

  if (!positions.length) {
    return (
      <div className="p-3 text-center text-[11px] text-slate-500">
        No open positions
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Positions ({positions.length})
        </h3>
      </div>

      {positions.map((pos) => {
        const livePrice = prices[pos.symbol] || pos.mark_price;
        const delta = pos.direction === "long"
          ? livePrice - pos.mark_price
          : pos.mark_price - livePrice;
        const adjustment = (delta / pos.entry_price) * pos.size_usd;
        const livePnl = pos.unrealized_pnl + adjustment;
        const livePnlPct = pos.margin > 0 ? (livePnl / pos.margin) * 100 : 0;
        const pnlColor = livePnl >= 0 ? "text-emerald-400" : "text-red-400";
        const isExpanded = expandedId === pos._id;

        return (
          <div
            key={pos._id}
            className={`rounded-xl border bg-slate-800/30 transition-all ${
              livePnl >= 0 ? "border-emerald-500/10" : "border-red-500/10"
            }`}
          >
            {/* Main row — always visible */}
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : pos._id)}
            >
              {/* Symbol + Direction */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-bold text-white">{pos.symbol.replace("-PERP", "")}</span>
                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                  pos.direction === "long"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "bg-red-500/15 text-red-400 border border-red-500/30"
                }`}>
                  {pos.direction.toUpperCase()} {pos.leverage}x
                </span>
                {pos.entry_reason && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-slate-700/40 text-slate-500 hidden sm:inline truncate max-w-[80px]">
                    {pos.entry_reason.split("_").map(w => w[0]?.toUpperCase()).join("")}
                  </span>
                )}
              </div>

              {/* Size */}
              <span className="text-[10px] text-slate-500 ml-auto tabular-nums">
                ${pos.size_usd.toFixed(0)}
              </span>

              {/* PnL */}
              <span className={`text-[11px] font-bold tabular-nums min-w-[70px] text-right ${pnlColor}`}>
                {livePnl >= 0 ? "+" : ""}${livePnl.toFixed(2)}
                <span className="text-[9px] ml-0.5">
                  ({livePnlPct >= 0 ? "+" : ""}{livePnlPct.toFixed(1)}%)
                </span>
              </span>

              {/* Close button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setClosingId(pos._id);
                  onClose(pos._id, livePrice).finally(() => setClosingId(null));
                }}
                disabled={closingId === pos._id}
                className="text-[9px] px-2 py-1 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-40 flex-shrink-0"
              >
                {closingId === pos._id ? "..." : "Close"}
              </button>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-white/[0.04] space-y-2">
                {/* Price info */}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div>
                    <span className="text-slate-500">Entry</span>
                    <div className="text-white font-bold">${pos.entry_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Mark</span>
                    <div className={`font-bold ${pnlColor}`}>${livePrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Liq</span>
                    <div className="text-red-400 font-bold">${pos.liquidation_price.toFixed(2)}</div>
                  </div>
                </div>

                {/* SL/TP */}
                <div className="flex flex-wrap gap-1.5 text-[9px]">
                  {pos.stop_loss && (
                    <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                      SL ${pos.stop_loss.toFixed(2)}
                    </span>
                  )}
                  {pos.take_profit && (
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      TP ${pos.take_profit.toFixed(2)}
                    </span>
                  )}
                  {pos.trailing_stop_price && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Trail ${pos.trailing_stop_price.toFixed(2)}
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Fees ${pos.total_fees.toFixed(2)}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onViewChart(pos.symbol)}
                    className="flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all"
                  >
                    Chart
                  </button>

                  {/* Partial close */}
                  {wallet && (
                    <button
                      onClick={async () => {
                        setActionLoading(`partial-${pos._id}`);
                        try {
                          await partialClosePosition(pos._id, livePrice, closePct, wallet);
                          onRefresh();
                        } catch { /* handled by parent */ }
                        setActionLoading(null);
                      }}
                      disabled={actionLoading === `partial-${pos._id}`}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-40"
                    >
                      {actionLoading === `partial-${pos._id}` ? "..." : `Close ${closePct}%`}
                    </button>
                  )}

                  {/* Pyramid */}
                  {wallet && livePnl > 0 && (pos.pyramid_level || 0) < 3 && (
                    <button
                      onClick={async () => {
                        setActionLoading(`pyramid-${pos._id}`);
                        try {
                          await pyramidPosition(pos._id, pyramidSize, livePrice, wallet);
                          onRefresh();
                        } catch { /* handled by parent */ }
                        setActionLoading(null);
                      }}
                      disabled={actionLoading === `pyramid-${pos._id}`}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-40"
                    >
                      {actionLoading === `pyramid-${pos._id}` ? "..." : `+$${pyramidSize}`}
                    </button>
                  )}

                  {/* Flip */}
                  {wallet && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Flip ${pos.symbol} ${pos.direction} → ${pos.direction === "long" ? "SHORT" : "LONG"}?`)) return;
                        setActionLoading(`flip-${pos._id}`);
                        try {
                          await flipPosition(pos._id, livePrice, wallet);
                          onRefresh();
                        } catch { /* handled by parent */ }
                        setActionLoading(null);
                      }}
                      disabled={actionLoading === `flip-${pos._id}`}
                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 transition-all disabled:opacity-40"
                    >
                      {actionLoading === `flip-${pos._id}` ? "..." : "Flip"}
                    </button>
                  )}
                </div>

                {/* Partial close slider */}
                {wallet && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500">Partial</span>
                    <input
                      type="range" min={10} max={90} step={10} value={closePct}
                      onChange={(e) => setClosePct(parseInt(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="text-[9px] text-amber-400 w-8">{closePct}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PositionsStrip;
