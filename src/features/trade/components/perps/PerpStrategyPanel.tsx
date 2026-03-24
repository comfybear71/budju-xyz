import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchStrategyStatus,
  updateStrategyConfig,
  startStrategyTest,
  stopStrategyTest,
  type StrategyStatus,
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
    name: "Ninja Scalper",
    desc: "Ultra-fast micro-scalping with tight limit orders hugging current price. In-and-out for tiny profits.",
    icon: "🥷",
    howItWorks: "Places layered limit orders at 0.10%, 0.25%, and 0.50% from current price to catch micro-bounces. Adds breakout stop orders just above recent highs / below recent lows for momentum entries. Uses 9-EMA for direction bias and RSI to avoid fading strong moves. Volatility filter skips dead or overly wild markets. Orders refresh every cycle (1hr expiry) to stay tight around price.",
    entrySignal: "LONG: Buy limits at 3 layers below price (0.1/0.25/0.5%) + buy stop above 15-candle high. SHORT: Sell limits at 3 layers above price + sell stop below 15-candle low. BB band levels added when within 0.8% of price. Direction biased by 9-EMA, filtered by RSI (no longs above 75, no shorts below 25).",
    exitStrategy: "Tight SL at 0.8x micro-ATR. Quick TP at 1.5x micro-ATR (~2:1 R:R after fees). 0.3% trailing stop locks in profit. Orders expire after 1 hour and refresh with updated levels.",
    riskManagement: "5x leverage for scalp edge. Max 10 pending orders, 4 per symbol. 0.5% equity risk per order, halved at 5% drawdown. Stops entirely at 10% drawdown. Volatility filter skips markets with ATR/price ratio outside 0.03-2% range.",
    bestConditions: "Liquid markets with regular micro-oscillations (SOL, BTC, ETH). Best during active trading sessions with moderate volatility. Underperforms in dead/choppy low-volume periods.",
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
  sr_reversal: {
    name: "S/R Reversal",
    desc: "Detects support/resistance levels from 15-min charts and trades reversals with RSI confirmation.",
    icon: "🔄",
    howItWorks: "Analyzes 15-minute candle data to identify key support and resistance levels via swing high/low clustering. When price approaches a known S/R level, the strategy looks for reversal confirmation: RSI oversold/overbought + price rejection (wick bounce). Clusters nearby levels within 0.3% to avoid duplicates. Requires price to be within 0.5% of the level to trigger.",
    entrySignal: "LONG: Price touches support level (within 0.5%) + RSI < 35 + price bouncing up (close > open). SHORT: Price touches resistance level (within 0.5%) + RSI > 65 + price rejecting down (close < open). Only trades levels with 2+ confluent touches.",
    exitStrategy: "Stop Loss at 1.5x ATR below entry. Take Profit at 3x ATR (2:1 reward/risk). 1% profit-activated trailing stop to lock in reversal gains.",
    riskManagement: "3x leverage (conservative for reversals). Max 3 concurrent positions. 30-minute cooldown per symbol to avoid rapid re-entries at the same level. Uses 15-min timeframe for more reliable S/R detection than 1-min noise.",
    bestConditions: "Markets with well-defined support/resistance zones. Works best on liquid pairs (SOL, BTC, ETH) that respect technical levels. Underperforms during strong breakouts through S/R.",
  },
};

const PerpStrategyPanel = ({ wallet }: Props) => {
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [testCountdown, setTestCountdown] = useState<string | null>(null);
  const [testingStrategy, setTestingStrategy] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Test countdown timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const testMode = status?.test_mode;
    if (!testMode?.active || !testMode.expires_at) {
      setTestCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const expires = new Date(testMode.expires_at).getTime();
      const remaining = expires - now;
      if (remaining <= 0) {
        setTestCountdown(null);
        loadStatus(); // Refresh to pick up expired state
        return;
      }
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTestCountdown(`${mins}:${secs.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    timerRef.current = setInterval(updateCountdown, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status?.test_mode, loadStatus]);

  const handleStartTest = async (stratName: string) => {
    try {
      setError(null);
      setTestingStrategy(stratName);
      await startStrategyTest(wallet, stratName, 60);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start test");
    } finally {
      setTestingStrategy(null);
    }
  };

  const handleStopTest = async () => {
    try {
      setError(null);
      await stopStrategyTest(wallet);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to stop test");
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

  const activeTest = status?.test_mode;

  return (
    <div className="space-y-3">

      {/* Active test banner */}
      {activeTest?.active && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-400 text-sm animate-pulse">⏱</span>
              <div>
                <div className="text-xs font-bold text-amber-300">Strategy Test Active</div>
                <div className="text-[10px] text-amber-400/70">
                  Testing <span className="font-bold text-amber-300">{STRATEGY_INFO[activeTest.strategy]?.name || activeTest.strategy}</span> — Max leverage, max size, all markets
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {testCountdown && (
                <span className="text-sm font-mono font-bold text-amber-300">{testCountdown}</span>
              )}
              <button
                onClick={handleStopTest}
                className="px-2 py-1 text-[10px] font-bold rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

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
                    {activeTest?.active && activeTest.strategy === name ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold animate-pulse">
                        Testing
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartTest(name)}
                        disabled={!!activeTest?.active || testingStrategy === name}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-purple-500/25 text-purple-400 hover:bg-purple-500/15 hover:text-purple-300 hover:border-purple-400/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {testingStrategy === name ? "..." : "Test 1hr"}
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
