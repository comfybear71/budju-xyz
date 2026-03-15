import { FaWallet, FaChartLine } from "react-icons/fa";
import type { SpotPortfolio as SpotPortfolioType } from "../services/spotApi";

interface SpotPortfolioProps {
  portfolio: SpotPortfolioType | null;
  dryRun: boolean;
}

export default function SpotPortfolio({ portfolio, dryRun }: SpotPortfolioProps) {
  if (!portfolio) {
    return (
      <div className="bg-black/30 rounded-budju border border-white/10 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-8 bg-white/10 rounded w-1/2" />
        </div>
      </div>
    );
  }

  const holdingCount = Object.keys(portfolio.holdings).length;

  return (
    <div className="bg-black/30 rounded-budju border border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white/70 flex items-center gap-2">
          <FaWallet className="text-budju-blue" />
          Portfolio
        </h3>
        {dryRun && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
            PAPER
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-white">${portfolio.total_value.toFixed(2)}</div>
          <div className="text-xs text-white/40">Total Value</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className={`text-xl font-bold ${portfolio.daily_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
            {portfolio.daily_pnl >= 0 ? "+" : ""}${portfolio.daily_pnl.toFixed(2)}
          </div>
          <div className="text-xs text-white/40">Today's PnL</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-white">{portfolio.daily_trades}</div>
          <div className="text-xs text-white/40">Trades Today</div>
        </div>
      </div>

      {holdingCount > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-white/40 px-1">
            <span>Asset</span>
            <span>Value / PnL</span>
          </div>
          {Object.entries(portfolio.holdings)
            .sort(([, a], [, b]) => b.value - a.value)
            .map(([symbol, h]) => (
              <div
                key={symbol}
                className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
              >
                <div>
                  <span className="text-sm font-semibold text-white">{symbol}</span>
                  <div className="text-xs text-white/40">
                    {h.amount.toFixed(6)} @ ${h.avg_entry < 0.01 ? h.avg_entry.toFixed(6) : h.avg_entry.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-white">${h.value.toFixed(2)}</div>
                  <div className={`text-xs ${h.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {h.pnl >= 0 ? "+" : ""}${h.pnl.toFixed(2)} ({h.pnl_pct.toFixed(1)}%)
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {holdingCount === 0 && (
        <div className="text-center py-4 text-white/30 text-sm">
          <FaChartLine className="mx-auto text-2xl mb-2 opacity-30" />
          No positions yet — buy some tokens to get started
        </div>
      )}

      {portfolio.wallet && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-white/30 truncate">
            Wallet: {portfolio.wallet}
          </p>
        </div>
      )}
    </div>
  );
}
