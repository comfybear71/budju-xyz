import type { PerpTrade } from "../../types/perps";

interface Props {
  trades: PerpTrade[];
}

const exitTypeLabel: Record<string, { label: string; color: string }> = {
  manual: { label: "Manual", color: "text-slate-400" },
  stop_loss: { label: "Stop Loss", color: "text-red-400" },
  take_profit: { label: "Take Profit", color: "text-emerald-400" },
  liquidation: { label: "Liquidated", color: "text-red-500" },
  trailing_stop: { label: "Trailing", color: "text-blue-400" },
};

const PerpTradeHistory = ({ trades }: Props) => {
  if (trades.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-xs">
        No closed trades yet.
      </div>
    );
  }

  return (
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
                <span className={exit.color}>{exit.label}</span>
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
  );
};

export default PerpTradeHistory;
