import { FaArrowUp, FaArrowDown, FaExternalLinkAlt } from "react-icons/fa";
import type { SpotTrade } from "../services/spotApi";

interface SpotTradeHistoryProps {
  trades: SpotTrade[];
}

export default function SpotTradeHistory({ trades }: SpotTradeHistoryProps) {
  if (trades.length === 0) {
    return (
      <div className="bg-black/30 rounded-budju border border-white/10 p-4">
        <h3 className="text-sm font-semibold text-white/70 mb-3">Recent Trades</h3>
        <p className="text-center text-white/30 text-sm py-6">No trades yet</p>
      </div>
    );
  }

  return (
    <div className="bg-black/30 rounded-budju border border-white/10 p-4">
      <h3 className="text-sm font-semibold text-white/70 mb-3">Recent Trades</h3>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {trades.map((trade, i) => (
          <div
            key={`${trade.timestamp}-${i}`}
            className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  trade.side === "buy"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {trade.side === "buy" ? <FaArrowDown /> : <FaArrowUp />}
              </span>
              <div>
                <span className="text-sm font-semibold text-white">
                  {trade.side.toUpperCase()} {trade.symbol}
                </span>
                <div className="text-xs text-white/40">
                  {new Date(trade.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-white">
                ${trade.usd_value.toFixed(2)}
              </div>
              <div className="text-xs text-white/40">
                {trade.amount.toFixed(6)} @ ${trade.price < 0.01 ? trade.price.toFixed(6) : trade.price.toFixed(2)}
              </div>
              {trade.pnl !== undefined && trade.side === "sell" && (
                <div className={`text-xs ${trade.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                  PnL: {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                </div>
              )}
              {trade.tx && trade.tx !== "dry_run" && (
                <a
                  href={`https://solscan.io/tx/${trade.tx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-budju-blue hover:underline inline-flex items-center gap-1"
                >
                  <FaExternalLinkAlt className="text-[8px]" />
                  tx
                </a>
              )}
              {trade.tx === "dry_run" && (
                <span className="text-xs text-yellow-400/60">simulated</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
