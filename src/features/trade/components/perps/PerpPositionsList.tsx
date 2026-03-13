import { useState } from "react";
import type { PerpPosition } from "../../types/perps";

interface Props {
  positions: PerpPosition[];
  onClose: (positionId: string, exitPrice: number) => void;
  onModify: (positionId: string) => void;
  readOnly?: boolean;
}

const PerpPositionsList = ({ positions, onClose, onModify, readOnly = false }: Props) => {
  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-xs">
        No open positions. Place a paper trade to get started.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {positions.map((pos) => {
        const pnlColor = pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
        const dirColor = pos.direction === "long" ? "text-emerald-400" : "text-red-400";
        const dirBg = pos.direction === "long" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20";
        const pnlSign = pos.unrealized_pnl >= 0 ? "+" : "";

        return (
          <div key={pos._id} className="bg-slate-800/40 rounded-xl border border-white/[0.04] p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{pos.symbol}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${dirBg} ${dirColor}`}>
                  {pos.direction.toUpperCase()} {pos.leverage}x
                </span>
              </div>
              <div className={`text-sm font-bold ${pnlColor}`}>
                {pnlSign}${pos.unrealized_pnl.toFixed(2)}
                <span className="text-[10px] ml-1">({pnlSign}{pos.unrealized_pnl_pct.toFixed(2)}%)</span>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
              <div>
                <span className="text-slate-500">Entry</span>
                <div className="text-slate-300">${pos.entry_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Mark</span>
                <div className="text-white font-medium">${pos.mark_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Liq.</span>
                <div className="text-red-400">${pos.liquidation_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Size</span>
                <div className="text-slate-300">${pos.size_usd.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-slate-500">Margin</span>
                <div className="text-slate-300">${pos.margin.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-slate-500">Fees</span>
                <div className="text-amber-400">${pos.total_fees.toFixed(2)}</div>
              </div>
            </div>

            {/* SL/TP indicators */}
            {(pos.stop_loss || pos.take_profit || pos.trailing_stop_price) && (
              <div className="flex gap-2 text-[10px] mb-2">
                {pos.stop_loss && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    SL: ${pos.stop_loss.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
                {pos.take_profit && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    TP: ${pos.take_profit.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
                {pos.trailing_stop_price && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Trail: ${pos.trailing_stop_price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
              </div>
            )}

            {/* Actions — hidden in read-only mode */}
            {!readOnly && (
              <div className="flex gap-2">
                <button
                  onClick={() => onModify(pos._id)}
                  className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white transition-colors border border-white/[0.04]"
                >
                  Modify
                </button>
                <button
                  onClick={() => onClose(pos._id, pos.mark_price)}
                  className="flex-1 text-[10px] py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20"
                >
                  Close Position
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PerpPositionsList;
