import { useState } from "react";
import type { PerpTrade } from "../../types/perps";

interface Props {
  trades: PerpTrade[];
  onRefresh?: () => Promise<void>;
}

const exitTypeLabel: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "text-slate-400" },
  stop_loss: { label: "Stop Loss", color: "text-red-400" },
  take_profit: { label: "Take Profit", color: "text-emerald-400" },
  liquidation: { label: "Liquidated", color: "text-red-500" },
  trailing_stop: { label: "Trailing", color: "text-blue-400" },
  kill_switch: { label: "Kill Switch", color: "text-amber-400" },
};

const PerpTradeHistory = ({ trades, onRefresh }: Props) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-2">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-500">
          {trades.length} trade{trades.length !== 1 ? "s" : ""}
        </div>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-[10px] px-2 py-0.5 rounded border border-white/[0.06] text-slate-400 hover:text-white hover:border-white/[0.12] transition-colors disabled:opacity-40"
          >
            {refreshing ? "⟳ ..." : "⟳ Refresh"}
          </button>
        )}
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          No closed trades yet.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {trades.map((trade, i) => {
            const pnlColor = trade.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
            const pnlSign = trade.realized_pnl >= 0 ? "+" : "";
            const dirColor = trade.direction === "long" ? "text-emerald-400" : "text-red-400";
            const exit = exitTypeLabel[trade.exit_type] || exitTypeLabel.manual;
            const holdTime = trade.holding_period_ms < 3600000
              ? `${Math.round(trade.holding_period_ms / 60000)}m`
              : trade.holding_period_ms < 86400000
                ? `${(trade.holding_period_ms / 3600000).toFixed(1)}h`
                : `${(trade.holding_period_ms / 86400000).toFixed(1)}d`;

            // Flag suspicious TP exits with losses
            const isBadTP = trade.exit_type === "take_profit" && trade.realized_pnl < 0;

            return (
              <div key={i} className="bg-slate-800/30 rounded-lg p-2.5 border border-white/[0.03] flex items-center gap-3">
                {/* Symbol & direction */}
                <div className="w-20">
                  <div className="text-xs font-bold text-white">{trade.symbol}</div>
                  <div className={`text-[10px] ${dirColor}`}>
                    {trade.direction.toUpperCase()} {trade.leverage}x
                  </div>
                </div>

                {/* Entry → Exit */}
                <div className="flex-1 text-[10px]">
                  <div className="text-slate-400">
                    ${trade.entry_price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    {" → "}
                    ${trade.exit_price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </div>
                  <div className="flex gap-2 text-slate-500">
                    <span>{holdTime}</span>
                    <span className={isBadTP ? "text-amber-400" : exit.color}>
                      {exit.label}{isBadTP ? " ⚠" : ""}
                    </span>
                    {trade.entry_reason && <span title={trade.entry_reason}>📝</span>}
                  </div>
                </div>

                {/* P&L */}
                <div className="text-right">
                  <div className={`text-xs font-bold ${pnlColor}`}>
                    {pnlSign}${trade.realized_pnl.toFixed(2)}
                  </div>
                  <div className={`text-[10px] ${pnlColor}`}>
                    {pnlSign}{trade.realized_pnl_pct.toFixed(2)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PerpTradeHistory;
