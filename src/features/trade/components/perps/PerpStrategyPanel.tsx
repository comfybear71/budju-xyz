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
  ninja: {
    name: "Ninja Ambush",
    desc: "Places pending orders at key technical levels. Orders wait like ambushes at support/resistance.",
    icon: "🥷",
    howItWorks: "Detects key price levels from 5 sources: swing highs/lows, Bollinger Band extremes, previous session levels, round psychological numbers, and liquidity sweep clusters. Levels are scored by confluence — multiple sources agreeing on the same level score higher. Top-ranked levels get pending limit/stop orders placed automatically.",
    entrySignal: "Limit buy at support (swing lows, BB lower, round numbers). Limit sell at resistance (swing highs, BB upper). Stop buy above breakout levels. Stop sell below breakdown levels. Only levels 2-8% from current price qualify.",
    exitStrategy: "SL at 2.5x ATR from entry. TP at 6x ATR. 2% profit-activated trailing stop. Orders expire after 24 hours and refresh with new analysis.",
    riskManagement: "Conservative 2x leverage. Max 8 pending orders (leaves room for manual orders). Max 2 orders per symbol. 1% equity risk per order, halved at 5% drawdown. Stops entirely at 10% drawdown.",
    bestConditions: "Markets with clear technical structure (support/resistance). Excels when price bounces between levels. Outperforms in volatile but range-bound conditions.",
  },
  grid: {
    name: "Grid Trading",
    desc: "ATR-based grid of buy/sell limit orders. Profits from price oscillation between levels.",
    icon: "📊",
    howItWorks: "Places 5 buy limit orders below current price and 5 sell limit orders above, spaced at 0.5x ATR intervals. Each order has a TP at the next grid level (one spacing away) and a catastrophic SL at 3x spacing. Grid auto-refreshes hourly or when price drifts >3 spacings from center. Selects the most range-bound symbols (lowest ATR/price ratio).",
    entrySignal: "Automatic limit orders at each grid level. Buy orders below price, sell orders above. Grid spacing adapts to current volatility via ATR.",
    exitStrategy: "Each trade targets exactly one grid spacing profit. Catastrophic stop at 3x spacing. Orders expire after 2 hours (refreshed hourly). Grid rebalances when price drifts too far from center.",
    riskManagement: "Conservative 2x leverage. 0.5% of equity per grid level. Max 2 symbols running grids simultaneously. Optional martingale (doubling each level) is disabled by default with hard cap at level 5 and 10% equity limit.",
    bestConditions: "Sideways/choppy markets with regular oscillations. Best on liquid pairs (SOL, BTC, ETH). Underperforms in strong directional trends.",
  },
  keltner: {
    name: "Keltner Channel",
    desc: "ATR-based channel strategy — auto-switches between mean reversion and squeeze breakout modes.",
    icon: "📐",
    howItWorks: "Uses Keltner Channels (EMA ± 1.5x ATR) instead of Bollinger Bands. Auto-detects when a 'squeeze' occurs (Bollinger Bands contract inside Keltner Channels, indicating extremely low volatility). In squeeze mode, trades the breakout. In normal mode, trades mean-reversion bounces off the channel boundaries. This dual-mode approach adapts to market conditions automatically.",
    entrySignal: "MEAN REVERSION: Long when price touches lower channel + RSI < 30. Short when price touches upper channel + RSI > 70. BREAKOUT: Long when price breaks above upper channel during squeeze release. Short when price breaks below lower channel during squeeze release.",
    exitStrategy: "Mean reversion: TP at channel middle (1.5x ATR), 1% trailing stop. Breakout: Wide 5x ATR TP, 2% trailing stop to let trends run.",
    riskManagement: "3x leverage, max 3 positions. 1.5% equity risk per trade. Squeeze detection prevents false breakout entries by requiring BB compression inside KC for minimum 5 bars before signaling.",
    bestConditions: "Versatile — works in both ranging and trending markets. Excels when volatility cycles between compression and expansion. Based on the Keltner Channel EA pattern from forex trading.",
  },
  bb_squeeze: {
    name: "BB Squeeze Breakout",
    desc: "Detects volatility compression (squeeze) and trades the explosive breakout that follows.",
    icon: "💥",
    howItWorks: "Monitors for Bollinger Band Squeeze: when BB contracts inside Keltner Channels, it signals extremely low volatility — a 'coiled spring'. The strategy waits for squeeze release (BB expands back outside KC), then enters in the direction of momentum. Uses a momentum oscillator (price - SMA) and RSI to confirm breakout direction, plus range expansion verification to avoid false signals.",
    entrySignal: "LONG: Squeeze releases + momentum positive and rising + RSI > 50 + current candle range > 1.2x average. SHORT: Squeeze releases + momentum negative and falling + RSI < 50 + range expansion. Requires minimum 8 consecutive squeeze bars before watching for release.",
    exitStrategy: "Wide 8x ATR take profit — trailing stop (2.5%) is the primary exit mechanism. 2x ATR stop loss gives breakouts room to develop. Maximum 3 bars after release to enter — no chasing old breakouts.",
    riskManagement: "4x leverage for conviction. Max 2 positions (high-conviction, low-frequency strategy). Only trades on verified squeeze releases with multiple confirmation signals. Inspired by the TTM Squeeze indicator from forex EA design.",
    bestConditions: "Markets transitioning from low to high volatility. After consolidation periods. Works best on liquid pairs with clear volatility cycles (SOL, BTC, ETH).",
  },
  hf_scalper: {
    name: "HF Scalper",
    desc: "High-frequency scalping — lots of small quick trades across all markets. Any profit is good profit.",
    icon: "⚡",
    howItWorks: "Runs 4 fast signal types every minute across all 10 markets: Micro EMA Cross (3/8 EMA), RSI Snap (RSI 5 bounce from extremes), Price Rejection (wick bounce off local high/low), and Momentum Burst (sudden acceleration). Each signal is scored and the best one triggers a trade. Uses 5-minute cooldown instead of 2 hours, allowing many trades per hour.",
    entrySignal: "MICRO CROSS: 3/8 EMA crossover (fires frequently). RSI SNAP: RSI(5) bounces from 25/75 extremes. WICK REJECTION: price dips below local low then bounces back. MOMENTUM BURST: current candle 1.5x larger than 10-bar average.",
    exitStrategy: "Very tight: SL at 0.5x ATR, TP at 1.0x ATR. 0.5% trailing stop locks in tiny gains fast. Trades typically last minutes, not hours.",
    riskManagement: "5x leverage, 0.5% equity per trade (~$50 on $10K). Max 15 concurrent positions. No correlation guard — can trade BTC, ETH, SOL simultaneously. Volume makes the money, not individual trade size.",
    bestConditions: "Any market with movement. More volatile = more signals. Works around the clock. Philosophy: 1000 trades × $1.50 = $1,500 beats 2 trades × $15 = $30.",
  },
  zone_recovery: {
    name: "Zone Recovery",
    desc: "Forex EA hedge recovery — opens opposing trades with escalating lots to recover losing positions.",
    icon: "🛡️",
    howItWorks: "Opens an initial trade based on EMA crossover signal. If the trade moves against us by one 'zone width' (1.5x ATR), it opens an opposing hedge trade at 1.3x the previous size (smooth martingale). This continues, alternating directions with escalating sizes, until the net PnL of all positions in the 'zone' hits the profit target. The key insight: the larger recovery positions only need a small move to recover the smaller initial losses.",
    entrySignal: "Initial: EMA 9/21 crossover + RSI 35-65 + trend filter. Recovery hedges: automatic when price crosses zone boundary (1.5x ATR from last entry). Supports smooth martingale (1.3x), D'Alembert (+base), or Fibonacci sizing modes.",
    exitStrategy: "Close entire zone when net profit reaches 0.5x ATR. Abandon zone after 5 recovery levels (hard cap). Also abandons if total zone exposure exceeds 15% of equity.",
    riskManagement: "3x leverage. Max 2 active zones across all symbols. Smooth martingale (1.3x) instead of classic 2x doubling reduces blowup risk significantly. 15% equity cap per zone prevents catastrophic accumulation. 10% drawdown circuit breaker.",
    bestConditions: "Choppy markets with mean-reverting tendencies. The zone width (1.5x ATR) adapts to volatility. Struggles in strong one-directional moves that exceed all recovery levels. Popular strategy pattern from forex Expert Advisors.",
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
            className={`relative w-14 h-7 rounded-full transition-all duration-200 disabled:opacity-40 ${
              status.auto_trading_enabled
                ? "bg-emerald-500/40 border border-emerald-500/50"
                : "bg-slate-700/60 border border-white/[0.08]"
            }`}
            aria-label="Toggle auto-trading"
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-200 shadow-sm flex items-center justify-center text-[8px] font-bold ${
                status.auto_trading_enabled
                  ? "left-[30px] bg-emerald-400 text-emerald-900"
                  : "left-1 bg-slate-500 text-slate-300"
              }`}
            >
              {toggling ? "..." : status.auto_trading_enabled ? "ON" : ""}
            </span>
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
                className={`relative w-10 h-5 rounded-full transition-all duration-200 flex-shrink-0 ${
                  isEnabled
                    ? "bg-emerald-500/40 border border-emerald-500/50"
                    : "bg-slate-700/60 border border-white/[0.06]"
                }`}
                aria-label={`Toggle ${info.name}`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200 shadow-sm ${
                    isEnabled
                      ? "left-[22px] bg-emerald-400"
                      : "left-0.5 bg-slate-500"
                  }`}
                />
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
          <p><strong className="text-slate-400">Risk management:</strong> 1.5% equity risk per trade, ATR-based stops, 5 positions per side per symbol, 2hr cooldown, 20% daily loss circuit breaker. Equity curve meta-filter auto-reduces sizing during cold streaks.</p>
          <p><strong className="text-slate-400">Data needed:</strong> ~{status.min_candles_required} candles of price data. Historical data is auto-seeded from Binance on first run — strategies activate immediately.</p>
        </div>
      </div>
    </div>
  );
};

export default PerpStrategyPanel;
