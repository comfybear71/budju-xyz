import { useState } from "react";
import type { DashboardData } from "../../hooks/useDashboardData";

interface Props {
  data: DashboardData;
}

const BotControlBar = ({ data }: Props) => {
  const {
    account, isLive, isKillSwitchActive, autoTradingEnabled, wsConnected,
    totalPnl, totalPnlPct, positions, prices, selectedSymbol,
    handleKillSwitch, handleSwitchMode, handleToggleBot,
  } = data;

  const [killLoading, setKillLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [botLoading, setBotLoading] = useState(false);

  const selectedPrice = prices[selectedSymbol] || 0;
  const pnlColor = totalPnl >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className={`sticky top-0 z-50 backdrop-blur-xl border-b px-3 py-2 ${
      isLive
        ? "bg-red-950/80 border-red-500/30"
        : "bg-[#0a0f1e]/90 border-white/[0.06]"
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Kill Switch */}
        {data.wallet && (
          <button
            onClick={async () => { setKillLoading(true); await handleKillSwitch(); setKillLoading(false); }}
            disabled={killLoading}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border flex-shrink-0 ${
              isKillSwitchActive
                ? "bg-red-600/40 text-red-200 border-red-500/60 animate-pulse"
                : "bg-slate-800/60 text-slate-400 border-slate-600/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40"
            } disabled:opacity-40`}
          >
            {killLoading ? "..." : isKillSwitchActive ? "KILL ON" : "KILL"}
          </button>
        )}

        {/* Paper/Live Toggle */}
        {data.wallet && (
          <button
            onClick={async () => { setModeLoading(true); await handleSwitchMode(); setModeLoading(false); }}
            disabled={modeLoading}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border flex-shrink-0 ${
              isLive
                ? "bg-red-500/25 text-red-300 border-red-500/40"
                : "bg-slate-800/60 text-slate-400 border-slate-600/30 hover:bg-amber-500/20 hover:text-amber-300"
            } disabled:opacity-40`}
          >
            {modeLoading ? "..." : isLive ? "LIVE" : "PAPER"}
          </button>
        )}

        {/* Bot ON/OFF */}
        {data.wallet && autoTradingEnabled !== null && (
          <button
            onClick={async () => { setBotLoading(true); await handleToggleBot(); setBotLoading(false); }}
            disabled={botLoading}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all border flex-shrink-0 ${
              autoTradingEnabled
                ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                : "bg-red-500/15 text-red-300 border-red-500/30 hover:bg-emerald-500/20 hover:text-emerald-300"
            } disabled:opacity-40`}
          >
            {botLoading ? "..." : autoTradingEnabled ? "BOT ON" : "BOT OFF"}
          </button>
        )}

        {/* Selected market price */}
        <div className="flex items-center gap-1.5 ml-auto">
          {selectedPrice > 0 && (
            <span className="text-sm font-bold text-white tabular-nums">
              {selectedSymbol.replace("-PERP", "")} ${selectedPrice >= 1
                ? selectedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : selectedPrice.toFixed(6)}
            </span>
          )}
        </div>

        {/* Equity + PnL */}
        <div className="flex items-center gap-3 text-[11px]">
          {account && (
            <span className="text-slate-400 hidden sm:inline">
              Eq <span className="text-white font-bold">${account.equity.toFixed(0)}</span>
            </span>
          )}
          {positions.length > 0 && (
            <span className={`font-bold ${pnlColor}`}>
              {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%)
            </span>
          )}
        </div>

        {/* WS Status */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? "bg-emerald-400" : "bg-red-400 animate-pulse"}`}
          title={wsConnected ? "WebSocket connected" : "WebSocket disconnected"}
        />
      </div>

      {/* Live mode warning */}
      {isLive && data.wallet && (
        <div className="mt-1.5 text-[10px] text-red-300/80 font-medium text-center">
          LIVE TRADING — Real funds at risk
        </div>
      )}
    </div>
  );
};

export default BotControlBar;
