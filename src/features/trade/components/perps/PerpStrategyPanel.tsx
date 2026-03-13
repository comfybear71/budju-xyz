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

interface StrategyDetail {
  name: string;
  desc: string;
  icon: string;
  howItWorks: string;
  entrySignal: string;
  exitStrategy: string;
  riskManagement: string;
  bestConditions: string;
}

const STRATEGY_INFO: Record<string, StrategyDetail> = {
  trend_following: {
    name: "Trend Following",
    desc: "EMA crossover + RSI confirmation. Rides strong directional moves with trailing stops.",
    icon: "📈",
    howItWorks: "Uses a 9-period fast EMA and 21-period slow EMA crossover system. When the fast EMA crosses above the slow EMA and RSI is between 35-65 (confirming momentum without being overbought), a long signal fires. A 50-period EMA trend filter ensures we only trade in the direction of the larger trend.",
    entrySignal: "LONG: Fast EMA crosses above Slow EMA + RSI 35-65 + Price above 50 EMA. SHORT: Fast EMA crosses below Slow EMA + RSI 35-65 + Price below 50 EMA.",
    exitStrategy: "Stop Loss at 2x ATR below entry. Take Profit at 8x ATR (wide — trailing stop is primary exit). 1.5% profit-activated trailing stop locks in gains after price moves 1.5% in your favor.",
    riskManagement: "5x leverage, max 2 concurrent positions. 1.5% equity risk per trade. ATR scaled to ~1hr timeframe for meaningful stop distances.",
    bestConditions: "Strong trending markets (BTC rallies, SOL pumps). Underperforms in choppy/sideways markets.",
  },
  scalping: {
    name: "Scalping",
    desc: "Quick RSI bounces + EMA slope for fast in-and-out trades.",
    icon: "⚡",
    howItWorks: "Detects short-term oversold/overbought conditions using a fast 7-period RSI combined with 5-period EMA slope direction. Enters on RSI bounces when the micro-trend confirms direction.",
    entrySignal: "LONG: RSI < 35 + EMA rising + price bouncing up, OR RSI crossing up from oversold with price above EMA. SHORT: RSI > 65 + EMA falling + price dropping, OR RSI crossing down from overbought with price below EMA.",
    exitStrategy: "Tight 1.5x ATR stop loss. Quick 2.5x ATR take profit. 0.8% profit-activated trailing stop locks gains fast.",
    riskManagement: "5x leverage, max 3 concurrent positions. Higher frequency but smaller position sizes. 30-min cooldown between trades per market.",
    bestConditions: "Markets with regular oscillations and clear micro-trends. Works well on SOL, BTC, ETH with decent volatility.",
  },
  swing_trading: {
    name: "Swing Trading",
    desc: "Multi-day holds at support/resistance. Targets larger swings.",
    icon: "🔄",
    howItWorks: "Identifies key support and resistance levels using historical price action combined with Fibonacci retracements. Enters positions at high-probability reversal zones confirmed by RSI extremes.",
    entrySignal: "LONG at support with RSI < 30. SHORT at resistance with RSI > 70. Multi-timeframe confirmation required.",
    exitStrategy: "Wider ATR-based stops for multi-day holds. Targets 5-20% price swings. Trailing stop activates after significant profit.",
    riskManagement: "Lower leverage (3-5x). Fewer but higher-conviction trades. Longer holding periods allow for wider stop placement.",
    bestConditions: "Markets with clear support/resistance levels. Works in both trending and ranging conditions. Best overall balance.",
  },
  mean_reversion: {
    name: "Mean Reversion",
    desc: "Bollinger Band bounce + RSI extremes. Fades overextensions.",
    icon: "🎯",
    howItWorks: "Uses 20-period Bollinger Bands (2 std dev) with RSI confirmation. When price touches the lower band AND RSI is oversold (< 30), the strategy expects a bounce back toward the middle band. The reverse for upper band touches.",
    entrySignal: "LONG: Price at/below lower Bollinger Band + RSI <= 30 + Price above 50 EMA (uptrend). SHORT: Price at/above upper Bollinger Band + RSI >= 70 + Price below 50 EMA (downtrend).",
    exitStrategy: "Stop Loss at 1.5x ATR (tighter since we expect a reversal). Take Profit targets the Bollinger middle band (mean). 1.0% trailing stop to lock in bounce profits.",
    riskManagement: "3x leverage (conservative). Max 2 positions. The 50 EMA trend filter prevents fading strong trends — only takes mean reversion trades aligned with the broader direction.",
    bestConditions: "Ranging/oscillating markets where price regularly bounces between bands. Underperforms in strong breakouts.",
  },
  momentum: {
    name: "Momentum Breakout",
    desc: "Price breakout from range with volume surge confirmation.",
    icon: "🚀",
    howItWorks: "Monitors a 20-candle price range. When price breaks above/below the range with a candle 1.5x larger than the average range (confirming strong momentum), a breakout trade is initiated. RSI confirms direction (above/below 50).",
    entrySignal: "LONG: Price breaks above 20-candle high + current candle > 1.5x avg range + RSI > 50 + Price above 50 EMA. SHORT: Price breaks below 20-candle low + current candle > 1.5x avg range + RSI < 50 + Price below 50 EMA.",
    exitStrategy: "Wider 2.5x ATR stop (breakouts need room). Very wide 10x ATR take profit — trailing stop is the primary exit. 2.0% profit-activated trailing stop lets winners run far.",
    riskManagement: "5x leverage, max 1 position (high conviction only). Requires strong confirmation to avoid false breakouts. 30-min cooldown.",
    bestConditions: "After periods of consolidation/low volatility. Works best when volume confirms the breakout direction.",
  },
  grid_bot: {
    name: "Grid / Futures Grid",
    desc: "Automated buy-low/sell-high within a price range.",
    icon: "📊",
    howItWorks: "Sets up a grid of buy and sell orders across a price range. When price drops to a grid level, it buys. When price rises to a grid level, it sells. Profits from oscillations within the range. Can be neutral or directionally biased.",
    entrySignal: "Automatic entries at each grid level. Grid spacing determined by volatility and number of levels (20-100).",
    exitStrategy: "Each grid trade has a built-in profit target (the next grid level). Overall grid has a configurable stop loss range.",
    riskManagement: "Capital distributed across grid levels. Total exposure limited. Works with lower leverage (2-3x) for safety.",
    bestConditions: "Sideways/choppy markets with regular oscillations. Underperforms in strong directional trends.",
  },
  funding_arb: {
    name: "Funding Rate Arb",
    desc: "Exploits funding rate inefficiencies for carry trade income.",
    icon: "💰",
    howItWorks: "Monitors perpetual funding rates. When funding is significantly positive (longs pay shorts), opens short positions to collect funding. When funding is significantly negative (shorts pay longs), opens long positions. Combined with a spot hedge for near risk-free carry.",
    entrySignal: "SHORT when 8hr funding rate > 0.03% (annualized > 30% APR). LONG when 8hr funding rate < -0.03%. Checks for sustained funding direction before entry.",
    exitStrategy: "Exits when funding rate normalizes (approaches zero). Position held as long as favorable funding continues.",
    riskManagement: "Low leverage (2-3x) since primary income is from funding, not price moves. Position sized to minimize directional risk. 10-30% APR target.",
    bestConditions: "Markets with persistent funding rate skew. Common during strong bull/bear markets when one side is heavily positioned.",
  },
};

const PerpStrategyPanel = ({ wallet }: Props) => {
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

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
        const info = STRATEGY_INFO[name] || { name, desc: "", icon: "📊", howItWorks: "", entrySignal: "", exitStrategy: "", riskManagement: "", bestConditions: "" } as StrategyDetail;
        const positions = status.strategy_positions[name] || [];
        const isEnabled = config.enabled;
        const isExpanded = expandedStrategy === name;

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
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    {info.name}
                    {info.howItWorks && (
                      <button
                        onClick={() => setExpandedStrategy(isExpanded ? null : name)}
                        className="text-[9px] px-1 py-0.5 rounded border border-blue-500/20 text-blue-400 hover:bg-blue-500/10 transition-colors"
                      >
                        {isExpanded ? "Hide" : "How?"}
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">{info.desc}</div>
                </div>
              </div>
              <button
                onClick={() => handleToggleStrategy(name)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all border flex-shrink-0 ${
                  isEnabled
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-700/40 text-slate-500 border-white/[0.04]"
                }`}
              >
                {isEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* Expanded strategy documentation */}
            {isExpanded && info.howItWorks && (
              <div className="mb-3 rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-2.5 space-y-2 text-[10px]">
                <div>
                  <div className="text-blue-400 font-bold uppercase text-[8px] tracking-wider mb-0.5">How It Works</div>
                  <div className="text-slate-400 leading-relaxed">{info.howItWorks}</div>
                </div>
                <div>
                  <div className="text-emerald-400 font-bold uppercase text-[8px] tracking-wider mb-0.5">Entry Signal</div>
                  <div className="text-slate-400 leading-relaxed">{info.entrySignal}</div>
                </div>
                <div>
                  <div className="text-amber-400 font-bold uppercase text-[8px] tracking-wider mb-0.5">Exit Strategy</div>
                  <div className="text-slate-400 leading-relaxed">{info.exitStrategy}</div>
                </div>
                <div>
                  <div className="text-red-400 font-bold uppercase text-[8px] tracking-wider mb-0.5">Risk Management</div>
                  <div className="text-slate-400 leading-relaxed">{info.riskManagement}</div>
                </div>
                <div>
                  <div className="text-purple-400 font-bold uppercase text-[8px] tracking-wider mb-0.5">Best Conditions</div>
                  <div className="text-slate-400 leading-relaxed">{info.bestConditions}</div>
                </div>
              </div>
            )}

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
