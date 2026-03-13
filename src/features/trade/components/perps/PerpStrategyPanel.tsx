import { useState, useEffect, useCallback } from "react";
import {
  fetchStrategyStatus,
  toggleAutoTrading,
  updateStrategyConfig,
  type StrategyStatus,
  type StrategySignal,
} from "../../services/perpApi";

interface Props {
  wallet: string;
}

const STRATEGY_INFO: Record<string, { name: string; desc: string; icon: string }> = {
  trend_following: {
    name: "Trend Following",
    desc: "EMA crossover + ADX strength + RSI confirmation. Rides strong directional moves with trailing stops. Best in trending markets.",
    icon: "📈",
  },
  scalping: {
    name: "Scalping",
    desc: "Quick RSI bounces + EMA slope. Enters long on RSI < 35 with rising EMA, short on RSI > 65 with falling EMA. Tight 0.8% trailing stop. 5x leverage.",
    icon: "⚡",
  },
  swing_trading: {
    name: "Swing Trading",
    desc: "Multi-day holds at support/resistance + Fibonacci + RSI 30/70. Targets 5-20% swings. Best balance for most conditions.",
    icon: "🔄",
  },
  mean_reversion: {
    name: "Mean Reversion",
    desc: "Bollinger Band bounce + RSI extremes. Fades overextensions back to the mean.",
    icon: "🎯",
  },
  momentum: {
    name: "Momentum Breakout",
    desc: "Price breakout from range with volume confirmation. Catches strong directional moves early.",
    icon: "🚀",
  },
  grid_bot: {
    name: "Grid / Futures Grid",
    desc: "Automated buy-low/sell-high within a price range. 20-100 grid levels, neutral or directional bias. Best in sideways/choppy markets.",
    icon: "📊",
  },
  funding_arb: {
    name: "Funding Rate Arb",
    desc: "Exploits funding rate inefficiencies. Short when funding positive, long when negative. Near risk-free carry trade (10-30% APR).",
    icon: "💰",
  },
};

const PerpStrategyPanel = ({ wallet }: Props) => {
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await fetchStrategyStatus(wallet);
      setStatus(s);
    } catch (err) {
      console.warn("[Strategy] Failed to load status:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30_000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  const handleToggle = async () => {
    if (!status) return;
    try {
      setToggling(true);
      setError(null);
      await toggleAutoTrading(!status.auto_trading_enabled, wallet);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle");
    } finally {
      setToggling(false);
    }
  };

  const handleToggleStrategy = async (stratName: string) => {
    if (!status) return;
    try {
      setError(null);
      const strat = status.strategies[stratName];
      await updateStrategyConfig(
        { [`strategies.${stratName}.enabled`]: !strat.enabled },
        wallet,
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-pulse text-sm text-slate-400">Loading strategies...</div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-center py-4 text-slate-500 text-xs">
        Strategy engine not available. Deploy backend first.
      </div>
    );
  }

  // Check data readiness
  const minCandles = status.min_candles_required;
  const allReady = Object.values(status.candle_counts).every((c) => c >= minCandles);
  const anyReady = Object.values(status.candle_counts).some((c) => c >= minCandles);

  return (
    <div className="space-y-3">
      {/* Master toggle */}
      <div className="bg-slate-800/40 rounded-xl p-3 border border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              🤖 Auto-Trading
              {status.auto_trading_enabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                  ACTIVE
                </span>
              )}
              {status.trading_paused && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                  PAUSED
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {status.auto_trading_enabled
                ? "Strategies are actively scanning for trades every minute"
                : "Enable to let strategies trade automatically"}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={toggling}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
              status.auto_trading_enabled
                ? "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
            } disabled:opacity-40`}
          >
            {toggling ? "..." : status.auto_trading_enabled ? "STOP" : "START"}
          </button>
        </div>
      </div>

      {/* Data collection progress */}
      <div className="bg-slate-800/40 rounded-lg p-2 border border-white/[0.04]">
        <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">
          Price Data Collection ({minCandles} candles needed)
        </div>
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(status.candle_counts).map(([symbol, count]) => {
            const progress = Math.min(count / minCandles, 1);
            const ready = count >= minCandles;
            return (
              <div key={symbol} className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400 w-16">{symbol.replace("-PERP", "")}</span>
                <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${ready ? "bg-emerald-500" : "bg-amber-500"}`}
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
                <span className={`text-[9px] ${ready ? "text-emerald-400" : "text-slate-500"}`}>
                  {count}
                </span>
              </div>
            );
          })}
        </div>
        {!allReady && (
          <p className="text-[10px] text-amber-400 mt-1.5">
            Collecting price data... Strategies activate after {minCandles} candles (~{Math.round(minCandles / 60)}h).
            {anyReady ? " Some markets ready." : ""}
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-slate-500 hover:text-white">✕</button>
        </div>
      )}

      {/* Strategy cards */}
      {Object.entries(status.strategies).map(([name, config]) => {
        const info = STRATEGY_INFO[name] || { name, desc: "", icon: "📊" };
        const positions = status.strategy_positions[name] || [];
        const isEnabled = config.enabled;

        return (
          <div
            key={name}
            className={`rounded-xl border p-3 transition-all ${
              isEnabled
                ? "bg-slate-800/40 border-white/[0.06]"
                : "bg-slate-800/20 border-white/[0.02] opacity-60"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">{info.icon}</span>
                <div>
                  <div className="text-xs font-bold text-white">{info.name}</div>
                  <div className="text-[10px] text-slate-500">{info.desc}</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleStrategy(name)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all border ${
                  isEnabled
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-700/40 text-slate-500 border-white/[0.04]"
                }`}
              >
                {isEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {isEnabled && (
              <div className="space-y-1.5">
                {/* Config summary */}
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                    {config.leverage}x leverage
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                    SL: {config.sl_atr_mult}x ATR
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                    TP: {config.tp_atr_mult}x ATR
                  </span>
                  {config.trailing_stop_pct > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Trail: {config.trailing_stop_pct}%
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 border border-white/[0.04]">
                    Max {config.max_positions} pos
                  </span>
                </div>

                {/* Markets */}
                <div className="flex flex-wrap gap-1 text-[10px]">
                  {config.markets.map((m: string) => (
                    <span key={m} className="px-1 py-0.5 rounded bg-slate-700/40 text-slate-400">
                      {m.replace("-PERP", "")}
                    </span>
                  ))}
                </div>

                {/* Active positions for this strategy */}
                {positions.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {positions.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px] bg-slate-800/60 rounded px-2 py-1">
                        <span className="text-slate-300">
                          {p.symbol}{" "}
                          <span className={p.direction === "long" ? "text-emerald-400" : "text-red-400"}>
                            {p.direction.toUpperCase()}
                          </span>
                        </span>
                        <span className={p.pnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Recent signals */}
      {status.recent_signals.length > 0 && (
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Recent Signals</div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {status.recent_signals.slice(0, 15).map((sig: StrategySignal, i: number) => (
              <div
                key={i}
                className="bg-slate-800/30 rounded-lg px-2.5 py-1.5 border border-white/[0.02] flex items-center gap-2"
              >
                <span className={`text-[10px] ${sig.acted ? "text-emerald-400" : "text-slate-500"}`}>
                  {sig.acted ? "✓" : "✗"}
                </span>
                <div className="flex-1 text-[10px]">
                  <span className="text-slate-300">{sig.symbol.replace("-PERP", "")}</span>
                  <span className={`ml-1 ${sig.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                    {sig.direction.toUpperCase()}
                  </span>
                  <span className="text-slate-500 ml-1">
                    {STRATEGY_INFO[sig.strategy]?.name || sig.strategy}
                  </span>
                </div>
                <span className="text-[9px] text-slate-600">
                  {sig.timestamp ? new Date(sig.timestamp).toLocaleTimeString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-slate-800/20 rounded-lg p-2.5 border border-white/[0.02]">
        <div className="text-[10px] text-slate-500 space-y-1">
          <p><strong className="text-slate-400">How it works:</strong> The cron runs every minute, fetches live prices, calculates technical indicators, and auto-places trades when signals align.</p>
          <p><strong className="text-slate-400">Risk management:</strong> 1.5% equity risk per trade, ATR-based stops, max 5 concurrent positions, 20% daily loss circuit breaker.</p>
          <p><strong className="text-slate-400">Data needed:</strong> ~{status.min_candles_required} candles of price data. Historical data is auto-seeded from Binance on first run — strategies activate immediately.</p>
        </div>
      </div>
    </div>
  );
};

export default PerpStrategyPanel;
