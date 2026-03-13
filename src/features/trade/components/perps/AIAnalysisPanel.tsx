// ============================================================
// AIAnalysisPanel — ML strategy breakdown across all markets
// Fetches live candle data from Binance and runs prediction
// engine on each market to show overall AI analysis.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { CODE_TO_BINANCE } from "@lib/services/binanceWs";

// ── Types (mirrored from TradingChart) ──────────────────────

interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

type Signal = "LONG" | "SHORT" | "SCALP LONG" | "SCALP SHORT" | "HOLD";

interface StrategyBreakdown {
  trend: { direction: "up" | "down" | "flat"; strength: number; slope: number };
  momentum: { rsi: number; bias: "bullish" | "bearish" | "neutral" };
  ema: { ema8: number; ema21: number; cross: "bullish" | "bearish" | "neutral" };
  volatility: { value: number; level: "low" | "medium" | "high" };
}

interface MarketAnalysis {
  symbol: string;
  base: string;
  price: number;
  signal: Signal;
  confidence: number;
  strategies: StrategyBreakdown;
  priceChange1h: number;
}

// ── Prediction Engine (same as TradingChart) ────────────────

function computeAnalysis(candles: CandleData[]): Omit<MarketAnalysis, "symbol" | "base" | "priceChange1h"> | null {
  const lookback = 60;
  if (candles.length < lookback) return null;

  const recent = candles.slice(-lookback);
  const closes = recent.map((c) => c.close);
  const n = closes.length;
  const currentPrice = closes[n - 1];

  // Weighted linear regression
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
  for (let i = 0; i < n; i++) {
    const w = 1 + (i / n) * 3;
    sumW += w; sumWX += w * i; sumWY += w * closes[i];
    sumWXX += w * i * i; sumWXY += w * i * closes[i];
  }
  const denom = sumW * sumWXX - sumWX * sumWX;
  if (Math.abs(denom) < 1e-10) return null;
  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;

  // RSI
  const shortPeriod = Math.min(14, Math.floor(n / 3));
  const recentCloses = closes.slice(-shortPeriod);
  let gains = 0, losses = 0;
  for (let i = 1; i < recentCloses.length; i++) {
    const diff = recentCloses[i] - recentCloses[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / shortPeriod;
  const avgLoss = losses / shortPeriod || 0.0001;
  const rsi = 100 - 100 / (1 + avgGain / avgLoss);

  // Volatility
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  // EMA crossover
  const ema = (data: number[], period: number): number => {
    const k = 2 / (period + 1);
    let e = data[0];
    for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return e;
  };
  const ema8 = ema(closes.slice(-21), 8);
  const ema21 = ema(closes.slice(-21), 21);
  const emaCrossSignal = (ema8 - ema21) / currentPrice;

  // Composite rate
  const trendRate = slope / currentPrice;
  const momentumNudge = ((rsi - 50) / 50) * volatility * 0.1;
  const emaNudge = emaCrossSignal * 0.5;
  const rawRate = trendRate * 0.6 + momentumNudge * 0.25 + emaNudge * 0.15;
  const maxRatePerCandle = 0.003;
  const clampedRate = Math.max(-maxRatePerCandle, Math.min(maxRatePerCandle, rawRate));

  const pctMove = clampedRate * 5 * 100; // 5 candle projection
  const absMove = Math.abs(pctMove);

  let signal: Signal;
  if (absMove < 0.01) signal = "HOLD";
  else if (pctMove > 0) signal = absMove > 0.15 ? "LONG" : "SCALP LONG";
  else signal = absMove > 0.15 ? "SHORT" : "SCALP SHORT";

  const trendStrength = Math.min(Math.abs(trendRate) / (volatility || 0.001), 1) * 100;
  const rsiConfidence = Math.abs(rsi - 50) * 2;
  const confidence = Math.min(
    Math.max(Math.round(trendStrength * 0.5 + rsiConfidence * 0.3 + Math.min(Math.abs(emaCrossSignal) * 500, 30) * 0.2), 10),
    95,
  );

  const strategies: StrategyBreakdown = {
    trend: {
      direction: Math.abs(trendRate) < 0.0001 ? "flat" : trendRate > 0 ? "up" : "down",
      strength: Math.min(Math.abs(trendRate) / (volatility || 0.001), 1) * 100,
      slope,
    },
    momentum: { rsi, bias: rsi > 60 ? "bullish" : rsi < 40 ? "bearish" : "neutral" },
    ema: {
      ema8, ema21,
      cross: ema8 > ema21 * 1.0002 ? "bullish" : ema8 < ema21 * 0.9998 ? "bearish" : "neutral",
    },
    volatility: {
      value: volatility * 100,
      level: volatility > 0.003 ? "high" : volatility > 0.001 ? "medium" : "low",
    },
  };

  return { price: currentPrice, signal, confidence, strategies };
}

// ── Fetch historical klines ─────────────────────────────────

const BINANCE_REST = "https://api.binance.com/api/v3/klines";

async function fetchKlines(binanceSymbol: string): Promise<CandleData[]> {
  const url = `${BINANCE_REST}?symbol=${binanceSymbol.toUpperCase()}&interval=1m&limit=120`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

// ── Markets ─────────────────────────────────────────────────

const MARKETS = [
  { symbol: "SOL-PERP", base: "SOL" },
  { symbol: "BTC-PERP", base: "BTC" },
  { symbol: "ETH-PERP", base: "ETH" },
  { symbol: "LINK-PERP", base: "LINK" },
  { symbol: "SUI-PERP", base: "SUI" },
  { symbol: "AVAX-PERP", base: "AVAX" },
];

// ── Component ───────────────────────────────────────────────

const AIAnalysisPanel = () => {
  const [analyses, setAnalyses] = useState<MarketAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    const results: MarketAnalysis[] = [];

    for (const m of MARKETS) {
      const binanceSym = CODE_TO_BINANCE[m.base];
      if (!binanceSym) continue;

      try {
        const candles = await fetchKlines(binanceSym);
        if (candles.length < 60) continue;

        const analysis = computeAnalysis(candles);
        if (!analysis) continue;

        // 1h price change (last 60 1m candles)
        const price60ago = candles[Math.max(0, candles.length - 60)].close;
        const priceChange1h = ((analysis.price - price60ago) / price60ago) * 100;

        results.push({ ...analysis, symbol: m.symbol, base: m.base, priceChange1h });
      } catch {
        // Skip market on error
      }
    }

    setAnalyses(results);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    runAnalysis();
    const interval = setInterval(runAnalysis, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, [runAnalysis]);

  // Aggregate stats
  const bullishCount = analyses.filter((a) => a.signal === "LONG" || a.signal === "SCALP LONG").length;
  const bearishCount = analyses.filter((a) => a.signal === "SHORT" || a.signal === "SCALP SHORT").length;
  const avgConfidence = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + a.confidence, 0) / analyses.length)
    : 0;
  const overallSentiment = bullishCount > bearishCount ? "Bullish" : bearishCount > bullishCount ? "Bearish" : "Mixed";

  const signalColor = (signal: Signal) => {
    if (signal === "LONG" || signal === "SCALP LONG") return "text-emerald-400";
    if (signal === "SHORT" || signal === "SCALP SHORT") return "text-red-400";
    return "text-slate-400";
  };

  const signalBg = (signal: Signal) => {
    if (signal === "LONG" || signal === "SCALP LONG") return "bg-emerald-500/10 border-emerald-500/20";
    if (signal === "SHORT" || signal === "SCALP SHORT") return "bg-red-500/10 border-red-500/20";
    return "bg-slate-500/10 border-slate-500/20";
  };

  const biasColor = (bias: string) => {
    if (bias === "bullish") return "text-emerald-400";
    if (bias === "bearish") return "text-red-400";
    return "text-slate-400";
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-blue-400">AI Analysis Engine</div>
          <div className="text-[10px] text-slate-500">
            Multi-strategy ML predictions across all markets
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[9px] text-slate-600">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="text-[9px] px-2 py-1 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-3 space-y-2">
        <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">How Our AI Works</div>
        <div className="text-[10px] text-slate-400 leading-relaxed">
          Our prediction engine blends 4 strategies on live 1-minute candle data to generate real-time signals:
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.04]">
            <div className="text-[9px] font-bold text-blue-300">Trend Analysis (60%)</div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              Weighted Linear Regression over 60 bars. Recent data weighted 3x more. Detects trend direction and strength.
            </div>
          </div>
          <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.04]">
            <div className="text-[9px] font-bold text-blue-300">Momentum (25%)</div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              14-period RSI measures momentum. Above 60 = bullish bias, below 40 = bearish. Scaled by volatility.
            </div>
          </div>
          <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.04]">
            <div className="text-[9px] font-bold text-blue-300">EMA Crossover (15%)</div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              EMA(8) vs EMA(21). Bullish cross = fast above slow. Bearish cross = fast below slow.
            </div>
          </div>
          <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.04]">
            <div className="text-[9px] font-bold text-blue-300">Volatility Filter</div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              Std deviation of returns. High volatility = wider ranges, lower confidence. Clamps predictions to max ±0.3%/candle.
            </div>
          </div>
        </div>
      </div>

      {/* Overall sentiment */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-slate-800/40 px-3 py-2 border border-white/[0.04] text-center">
          <div className="text-[9px] text-slate-500 uppercase">Sentiment</div>
          <div className={`text-sm font-bold ${
            overallSentiment === "Bullish" ? "text-emerald-400" :
            overallSentiment === "Bearish" ? "text-red-400" : "text-slate-400"
          }`}>
            {overallSentiment}
          </div>
          <div className="text-[9px] text-slate-600">
            {bullishCount}B / {bearishCount}S / {analyses.length - bullishCount - bearishCount}H
          </div>
        </div>
        <div className="rounded-lg bg-slate-800/40 px-3 py-2 border border-white/[0.04] text-center">
          <div className="text-[9px] text-slate-500 uppercase">Avg Confidence</div>
          <div className={`text-sm font-bold ${avgConfidence > 50 ? "text-blue-400" : "text-slate-400"}`}>
            {avgConfidence}%
          </div>
          <div className="text-[9px] text-slate-600">across {analyses.length} markets</div>
        </div>
        <div className="rounded-lg bg-slate-800/40 px-3 py-2 border border-white/[0.04] text-center">
          <div className="text-[9px] text-slate-500 uppercase">Markets</div>
          <div className="text-sm font-bold text-white">{analyses.length}</div>
          <div className="text-[9px] text-slate-600">live feeds</div>
        </div>
      </div>

      {/* Per-market breakdown */}
      {loading && analyses.length === 0 ? (
        <div className="text-center py-6">
          <div className="text-sm text-slate-400 animate-pulse">Analyzing all markets...</div>
        </div>
      ) : (
        <div className="space-y-2">
          {analyses.map((a) => (
            <div
              key={a.symbol}
              className={`rounded-xl border p-3 ${signalBg(a.signal)}`}
            >
              {/* Market header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{a.base}/USDT</span>
                  <span className="text-[10px] font-mono text-slate-300">
                    ${a.price >= 1000 ? a.price.toFixed(2) : a.price >= 1 ? a.price.toFixed(4) : a.price.toFixed(6)}
                  </span>
                  <span className={`text-[9px] font-bold ${a.priceChange1h >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {a.priceChange1h >= 0 ? "+" : ""}{a.priceChange1h.toFixed(2)}% 1h
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${signalColor(a.signal)} ${signalBg(a.signal)}`}>
                    {a.signal}
                  </span>
                  <span className="text-[9px] text-slate-500">{a.confidence}%</span>
                </div>
              </div>

              {/* Strategy grid */}
              <div className="grid grid-cols-4 gap-1.5">
                {/* Trend */}
                <div className="rounded bg-slate-900/50 px-2 py-1 border border-white/[0.03]">
                  <div className="text-[7px] text-slate-600 uppercase">Trend</div>
                  <div className={`text-[9px] font-bold ${
                    a.strategies.trend.direction === "up" ? "text-emerald-400" :
                    a.strategies.trend.direction === "down" ? "text-red-400" : "text-slate-400"
                  }`}>
                    {a.strategies.trend.direction === "up" ? "Bullish" :
                     a.strategies.trend.direction === "down" ? "Bearish" : "Flat"}
                  </div>
                  <div className="text-[7px] text-slate-600">{a.strategies.trend.strength.toFixed(0)}% str</div>
                </div>

                {/* RSI */}
                <div className="rounded bg-slate-900/50 px-2 py-1 border border-white/[0.03]">
                  <div className="text-[7px] text-slate-600 uppercase">RSI</div>
                  <div className={`text-[9px] font-bold ${biasColor(a.strategies.momentum.bias)}`}>
                    {a.strategies.momentum.rsi.toFixed(1)}
                  </div>
                  <div className="text-[7px] text-slate-600">{a.strategies.momentum.bias}</div>
                </div>

                {/* EMA */}
                <div className="rounded bg-slate-900/50 px-2 py-1 border border-white/[0.03]">
                  <div className="text-[7px] text-slate-600 uppercase">EMA</div>
                  <div className={`text-[9px] font-bold ${biasColor(a.strategies.ema.cross)}`}>
                    {a.strategies.ema.cross === "bullish" ? "8 > 21" :
                     a.strategies.ema.cross === "bearish" ? "8 < 21" : "Flat"}
                  </div>
                  <div className="text-[7px] text-slate-600">{a.strategies.ema.cross}</div>
                </div>

                {/* Volatility */}
                <div className="rounded bg-slate-900/50 px-2 py-1 border border-white/[0.03]">
                  <div className="text-[7px] text-slate-600 uppercase">Vol</div>
                  <div className={`text-[9px] font-bold ${
                    a.strategies.volatility.level === "high" ? "text-amber-400" :
                    a.strategies.volatility.level === "medium" ? "text-blue-400" : "text-slate-400"
                  }`}>
                    {a.strategies.volatility.value.toFixed(3)}%
                  </div>
                  <div className="text-[7px] text-slate-600">{a.strategies.volatility.level}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Signal guide */}
      <div className="rounded-lg border border-white/[0.04] bg-slate-800/30 p-2.5">
        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Signal Guide</div>
        <div className="grid grid-cols-2 gap-1">
          <div className="text-[9px] text-slate-500"><span className="text-emerald-400 font-bold">LONG</span> — Strong uptrend, momentum + trend agree</div>
          <div className="text-[9px] text-slate-500"><span className="text-red-400 font-bold">SHORT</span> — Strong downtrend, momentum + trend agree</div>
          <div className="text-[9px] text-slate-500"><span className="text-emerald-400 font-bold">SCALP LONG</span> — Mild bullish, small move expected</div>
          <div className="text-[9px] text-slate-500"><span className="text-red-400 font-bold">SCALP SHORT</span> — Mild bearish, small move expected</div>
          <div className="text-[9px] text-slate-500"><span className="text-slate-400 font-bold">HOLD</span> — No clear direction, stay flat</div>
          <div className="text-[9px] text-slate-500"><span className="text-blue-400 font-bold">Confidence</span> — How strongly strategies agree (10-95%)</div>
        </div>
      </div>
    </div>
  );
};

export default AIAnalysisPanel;
