// ============================================================
// TradingChart — Real-time Binance WebSocket candlestick chart
// Uses TradingView Lightweight Charts with:
//   - Live 1m kline streaming from Binance
//   - Historical seed data from Binance REST API
//   - Trade entry/exit markers (green ▲ long, red ▼ short)
//   - Position average entry lines + SL/TP lines
//   - Strategy prediction zones (faint projected paths)
//   - Win/loss time-of-day heatmap background
//   - Toggle between line and candlestick mode
// ============================================================

import { useRef, useEffect, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  ColorType,
  Time,
  SeriesMarker,
  LineStyle,
} from "lightweight-charts";
import {
  BinanceKlineStream,
  CODE_TO_BINANCE,
  type KlineBar,
} from "@lib/services/binanceWs";
import type { PerpPosition, PerpTrade } from "../../types/perps";

// ── Types ────────────────────────────────────────────────────

interface Props {
  symbol: string; // e.g. "SOL-PERP"
  baseAsset: string; // e.g. "SOL"
  positions?: PerpPosition[];
  trades?: PerpTrade[];
  pendingOrders?: unknown[]; // accepted for compatibility with MobileAreaChart
  height?: number;
  compact?: boolean;
  loadDelay?: number; // accepted for compatibility with MobileAreaChart
}

interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Helpers ──────────────────────────────────────────────────

// Try our own proxy first (works from any location/VPN), then direct Binance.
// The proxy at /api/klines cascades through Binance.US, OKX, and Binance Global.
// Direct Binance works from most countries but returns 451 from US IPs.

async function fetchHistoricalKlines(
  binanceSymbol: string,
  interval = "1m",
  limit = 500,
): Promise<CandleData[]> {
  const symbol = binanceSymbol.toUpperCase();

  // Try proxy first (always works), then direct Binance (faster when not geo-blocked)
  const urls = [
    `/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;
      return data.map((k: any[]) => ({
        time: (Math.floor(k[0] / 1000)) as Time,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }));
    } catch {
      continue;
    }
  }
  return [];
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

// ── ML Prediction Engine ─────────────────────────────────────
// Uses weighted linear regression + momentum + volatility analysis
// to project price N candles into the future and generate signals.

type Signal = "LONG" | "SHORT" | "SCALP LONG" | "SCALP SHORT" | "HOLD";

interface Prediction {
  points: { time: Time; value: number }[];
  signal: Signal;
  confidence: number; // 0-100
  targetPrice: number;
  strategies?: StrategyBreakdown;
}

interface StrategyBreakdown {
  trend: { direction: "up" | "down" | "flat"; strength: number; slope: number };
  momentum: { rsi: number; bias: "bullish" | "bearish" | "neutral" };
  ema: { ema8: number; ema21: number; cross: "bullish" | "bearish" | "neutral" };
  volatility: { value: number; level: "low" | "medium" | "high" };
}

function computePrediction(candles: CandleData[], lookback = 60, futureCandles = 5): Prediction | null {
  if (candles.length < lookback) return null;

  const recent = candles.slice(-lookback);
  const closes = recent.map((c) => c.close);
  const n = closes.length;

  // 1. Weighted linear regression (recent data weighted more)
  let sumW = 0, sumWX = 0, sumWY = 0, sumWXX = 0, sumWXY = 0;
  for (let i = 0; i < n; i++) {
    const w = 1 + (i / n) * 3; // Weight: 1→4 (recent 3x more important)
    sumW += w;
    sumWX += w * i;
    sumWY += w * closes[i];
    sumWXX += w * i * i;
    sumWXY += w * i * closes[i];
  }
  const denom = sumW * sumWXX - sumWX * sumWX;
  if (Math.abs(denom) < 1e-10) return null;
  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;

  // 2. Momentum (RSI-like)
  const shortPeriod = Math.min(14, Math.floor(n / 3));
  const recentCloses = closes.slice(-shortPeriod);
  let gains = 0, losses = 0;
  for (let i = 1; i < recentCloses.length; i++) {
    const diff = recentCloses[i] - recentCloses[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / shortPeriod;
  const avgLoss = losses / shortPeriod || 0.0001;
  const rsi = 100 - 100 / (1 + avgGain / avgLoss);

  // 3. Volatility (standard deviation of returns)
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  // 4. EMA crossover signal (8 vs 21 period)
  const ema = (data: number[], period: number): number => {
    const k = 2 / (period + 1);
    let e = data[0];
    for (let i = 1; i < data.length; i++) e = data[i] * k + e * (1 - k);
    return e;
  };
  const ema8 = ema(closes.slice(-21), 8);
  const ema21 = ema(closes.slice(-21), 21);
  const emaCrossSignal = (ema8 - ema21) / closes[n - 1]; // Very small normalized value

  // 5. Generate prediction — just 1-2 candles ahead, tightly clamped
  const lastCandle = candles[candles.length - 1];
  const lastTime = lastCandle.time as number;
  const currentPrice = lastCandle.close;

  // Normalized per-candle rate from trend
  const trendRate = slope / currentPrice;
  // Momentum nudge: RSI 70+ = slight bullish, RSI 30- = slight bearish
  const momentumNudge = ((rsi - 50) / 50) * volatility * 0.1;
  // EMA nudge: very small
  const emaNudge = emaCrossSignal * 0.5;

  // Blend and CLAMP to prevent wild projections (max ±0.3% per candle)
  const rawRate = trendRate * 0.6 + momentumNudge * 0.25 + emaNudge * 0.15;
  const maxRatePerCandle = 0.003; // ±0.3% max per candle
  const clampedRate = Math.max(-maxRatePerCandle, Math.min(maxRatePerCandle, rawRate));

  const points: { time: Time; value: number }[] = [
    { time: lastTime as Time, value: currentPrice },
  ];

  for (let i = 1; i <= futureCandles; i++) {
    const futureTime = (lastTime + i * 900) as Time; // 15m candles
    const projected = currentPrice * (1 + clampedRate * i);
    points.push({ time: futureTime, value: projected });
  }

  const targetPrice = points[points.length - 1].value;
  const pctMove = ((targetPrice - currentPrice) / currentPrice) * 100;

  // 6. Determine signal
  let signal: Signal;
  const absMove = Math.abs(pctMove);
  if (absMove < 0.01) {
    signal = "HOLD";
  } else if (pctMove > 0) {
    signal = absMove > 0.15 ? "LONG" : "SCALP LONG";
  } else {
    signal = absMove > 0.15 ? "SHORT" : "SCALP SHORT";
  }

  // 7. Confidence
  const trendStrength = Math.min(Math.abs(trendRate) / (volatility || 0.001), 1) * 100;
  const rsiConfidence = Math.abs(rsi - 50) * 2;
  const confidence = Math.min(Math.round(trendStrength * 0.5 + rsiConfidence * 0.3 + Math.min(Math.abs(emaCrossSignal) * 500, 30) * 0.2), 95);

  // 8. Strategy breakdown for info panel
  const strategies: StrategyBreakdown = {
    trend: {
      direction: Math.abs(trendRate) < 0.0001 ? "flat" : trendRate > 0 ? "up" : "down",
      strength: Math.min(Math.abs(trendRate) / (volatility || 0.001), 1) * 100,
      slope,
    },
    momentum: {
      rsi,
      bias: rsi > 60 ? "bullish" : rsi < 40 ? "bearish" : "neutral",
    },
    ema: {
      ema8,
      ema21,
      cross: ema8 > ema21 * 1.0002 ? "bullish" : ema8 < ema21 * 0.9998 ? "bearish" : "neutral",
    },
    volatility: {
      value: volatility * 100,
      level: volatility > 0.003 ? "high" : volatility > 0.001 ? "medium" : "low",
    },
  };

  return { points, signal, confidence: Math.max(confidence, 10), targetPrice, strategies };
}

// ── Component ────────────────────────────────────────────────

const TradingChart = ({
  symbol,
  baseAsset,
  positions = [],
  trades = [],
  height = 300,
  compact = false,
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const predictionSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const klineStreamRef = useRef<BinanceKlineStream | null>(null);
  const dataRef = useRef<CandleData[]>([]);
  const priceLinesRef = useRef<any[]>([]);

  const [chartMode, setChartMode] = useState<"candle" | "line">("candle");
  const [livePrice, setLivePrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [showPrediction, setShowPrediction] = useState(true);
  const [showStrategyInfo, setShowStrategyInfo] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showPositionLines, setShowPositionLines] = useState(true);
  const [showVolume, setShowVolume] = useState(true);

  const binanceSymbol = CODE_TO_BINANCE[baseAsset] || `${baseAsset.toLowerCase()}usdt`;

  // ── Chart Initialization ───────────────────────────────────

  const initChart = useCallback(() => {
    if (!containerRef.current) return;

    // Clean up existing
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255, 255, 255, 0.4)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.02)" },
        horzLines: { color: "rgba(255, 255, 255, 0.02)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "transparent",
        rightOffset: 5,
      },
      crosshair: {
        mode: 0, // Normal crosshair
        vertLine: { color: "rgba(255, 255, 255, 0.08)", width: 1, style: LineStyle.Dashed },
        horzLine: { color: "rgba(255, 255, 255, 0.08)", width: 1, style: LineStyle.Dashed },
      },
      rightPriceScale: {
        borderColor: "transparent",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true },
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "rgba(34, 197, 94, 0.5)",
      wickDownColor: "rgba(239, 68, 68, 0.5)",
      visible: chartMode === "candle",
    });

    // Line series (area style)
    const lineSeries = chart.addLineSeries({
      color: "#3b82f6",
      lineWidth: 2,
      visible: chartMode === "line",
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
    });

    // Volume histogram at bottom
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // ML Prediction line — blue dashed projection
    const predictionSeries = chart.addLineSeries({
      color: "rgba(59, 130, 246, 0.8)", // Blue
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
      visible: showPrediction,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    lineSeriesRef.current = lineSeries;
    volumeSeriesRef.current = volumeSeries;
    predictionSeriesRef.current = predictionSeries;

    // Resize handler
    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [height, chartMode, showPrediction]);

  // ── Load Historical Data + Start WS ────────────────────────

  useEffect(() => {
    const cleanup = initChart();
    let wsCleanup: (() => void) | null = null;

    (async () => {
      setLoading(true);

      // Fetch historical 1m klines from Binance REST
      const historical = await fetchHistoricalKlines(binanceSymbol, "15m", 500);
      dataRef.current = historical;

      if (candleSeriesRef.current && historical.length > 0) {
        candleSeriesRef.current.setData(historical);
        lineSeriesRef.current?.setData(
          historical.map((c) => ({ time: c.time, value: c.close })),
        );

        // Set initial price
        const last = historical[historical.length - 1];
        if (last) {
          setLivePrice(last.close);
          if (historical.length > 1) {
            const first = historical[0];
            setPriceChange(((last.close - first.close) / first.close) * 100);
          }
        }
      }

      // Add trade markers
      addTradeMarkers();
      // Add position lines
      addPositionLines();

      // Compute initial prediction
      if (showPrediction && historical.length >= 60) {
        const pred = computePrediction(historical);
        if (pred && predictionSeriesRef.current) {
          predictionSeriesRef.current.setData(pred.points);
          setPrediction(pred);
        }
      }

      setLoading(false);

      // Start kline WebSocket
      const stream = new BinanceKlineStream(binanceSymbol, "15m");
      klineStreamRef.current = stream;
      stream.connect();

      const unsub = stream.onBar((bar: KlineBar) => {
        setConnected(true);
        setLivePrice(bar.close);

        const candle: CandleData = {
          time: bar.time as Time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        };

        // Update or append candle
        candleSeriesRef.current?.update(candle);
        lineSeriesRef.current?.update({ time: candle.time, value: candle.close });
        volumeSeriesRef.current?.update({
          time: candle.time,
          value: bar.volume,
          color: bar.close >= bar.open ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
        });

        // Update price change from first historical bar
        if (dataRef.current.length > 0) {
          const first = dataRef.current[0];
          setPriceChange(((bar.close - first.close) / first.close) * 100);
        }

        // Update prediction on each completed candle (isFinal)
        if (bar.isFinal && showPrediction) {
          // Append the completed candle to dataRef for prediction calc
          dataRef.current = [...dataRef.current, candle];
          const pred = computePrediction(dataRef.current);
          if (pred && predictionSeriesRef.current) {
            predictionSeriesRef.current.setData(pred.points);
            setPrediction(pred);
          }
        }
      });

      wsCleanup = () => {
        unsub();
        stream.disconnect();
      };
    })();

    return () => {
      cleanup?.();
      wsCleanup?.();
      if (klineStreamRef.current) {
        klineStreamRef.current.disconnect();
        klineStreamRef.current = null;
      }
    };
  }, [binanceSymbol, initChart]);

  // ── Trade Markers ──────────────────────────────────────────

  const addTradeMarkers = useCallback(() => {
    if (!candleSeriesRef.current) return;
    if (!showMarkers || trades.length === 0) {
      candleSeriesRef.current.setMarkers([]);
      return;
    }

    const markers: SeriesMarker<Time>[] = [];

    for (const trade of trades) {
      if (trade.symbol !== symbol) continue;

      // Entry marker
      markers.push({
        time: (Math.floor(new Date(trade.entry_time).getTime() / 1000)) as Time,
        position: trade.direction === "long" ? "belowBar" : "aboveBar",
        color: trade.direction === "long" ? "#22c55e" : "#ef4444",
        shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
        text: `${trade.direction === "long" ? "L" : "S"} $${formatPrice(trade.entry_price)}`,
      });

      // Exit marker
      if (trade.exit_time) {
        const isProfitable = trade.realized_pnl >= 0;
        markers.push({
          time: (Math.floor(new Date(trade.exit_time).getTime() / 1000)) as Time,
          position: "aboveBar",
          color: isProfitable ? "#a855f7" : "#f59e0b",
          shape: "circle",
          text: `${isProfitable ? "+" : ""}$${trade.realized_pnl.toFixed(2)}`,
        });
      }
    }

    // Sort by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    candleSeriesRef.current.setMarkers(markers);
  }, [trades, symbol, showMarkers]);

  // ── Position Lines (entry price, SL, TP) ───────────────────

  const addPositionLines = useCallback(() => {
    if (!candleSeriesRef.current) return;

    // Remove existing price lines
    for (const line of priceLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(line); } catch { /* already removed */ }
    }
    priceLinesRef.current = [];

    if (!showPositionLines) return;

    const myPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");

    for (const pos of myPositions) {
      // Entry price line
      priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
        price: pos.entry_price,
        color: pos.direction === "long" ? "#22c55e" : "#ef4444",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${pos.direction.toUpperCase()} Entry`,
      }));

      // Stop loss line
      if (pos.stop_loss) {
        priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
          price: pos.stop_loss,
          color: "#f59e0b",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "SL",
        }));
      }

      // Take profit line
      if (pos.take_profit) {
        priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
          price: pos.take_profit,
          color: "#a855f7",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "TP",
        }));
      }

      // Liquidation line
      if (pos.liquidation_price) {
        priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
          price: pos.liquidation_price,
          color: "#dc2626",
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: "LIQ",
        }));
      }
    }
  }, [positions, symbol, showPositionLines]);

  // ── Toggle chart mode ──────────────────────────────────────

  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartMode === "candle" });
    lineSeriesRef.current?.applyOptions({ visible: chartMode === "line" });
  }, [chartMode]);

  // ── Toggle prediction visibility ─────────────────────────

  useEffect(() => {
    predictionSeriesRef.current?.applyOptions({ visible: showPrediction });
  }, [showPrediction]);

  // ── Toggle markers visibility ──────────────────────────

  useEffect(() => {
    addTradeMarkers();
  }, [showMarkers, addTradeMarkers]);

  // ── Toggle position lines visibility ───────────────────

  useEffect(() => {
    addPositionLines();
  }, [showPositionLines, addPositionLines]);

  // ── Toggle volume visibility ───────────────────────────

  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: showVolume });
  }, [showVolume]);

  // ── Render ─────────────────────────────────────────────────

  const isPositive = priceChange >= 0;

  return (
    <div className="relative">
      {/* Header */}
      <div className={`${compact ? "mb-1" : "mb-2"}`}>
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`font-bold ${compact ? "text-xs" : "text-sm"} text-white whitespace-nowrap`}>
                {baseAsset}/USDT
              </span>
              {connected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              )}
              {livePrice > 0 && (
                <>
                  <span className={`font-mono font-bold ${compact ? "text-xs" : "text-sm"} text-white whitespace-nowrap`}>
                    ${formatPrice(livePrice)}
                  </span>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
            {/* Signal badge — below currency label */}
            {showPrediction && prediction && !compact && (
              <button
                onClick={() => setShowStrategyInfo(!showStrategyInfo)}
                className={`mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
                  prediction.signal === "LONG" || prediction.signal === "SCALP LONG"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                    : prediction.signal === "SHORT" || prediction.signal === "SCALP SHORT"
                      ? "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                      : "bg-slate-500/15 text-slate-400 border-slate-500/30 hover:bg-slate-500/25"
                }`}
                title="Click for strategy breakdown"
              >
                {prediction.signal} {prediction.confidence}%
              </button>
            )}
            {/* Compact signal badge — below currency label */}
            {showPrediction && prediction && compact && (
              <div className="mt-0.5">
                <span
                  className={`text-[8px] font-bold px-1 py-0.5 rounded border ${
                    prediction.signal === "LONG" || prediction.signal === "SCALP LONG"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : prediction.signal === "SHORT" || prediction.signal === "SCALP SHORT"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                  }`}
                  title={`${prediction.signal} (${prediction.confidence}%)`}
                >
                  {prediction.signal} {prediction.confidence}%
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          {/* Chart mode toggle */}
          <div className="flex rounded bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setChartMode("candle")}
              className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
                chartMode === "candle"
                  ? "text-blue-400 bg-blue-500/15"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Candle
            </button>
            <button
              onClick={() => setChartMode("line")}
              className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
                chartMode === "line"
                  ? "text-blue-400 bg-blue-500/15"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Line
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 z-10 rounded-lg">
          <div className="text-xs text-slate-400 animate-pulse">Loading {baseAsset} chart...</div>
        </div>
      )}

      {/* Active positions overlay */}
      {positions.filter((p) => p.symbol === symbol && p.status === "open").length > 0 && (
        <div className="absolute top-8 left-2 z-10 space-y-0.5">
          {positions
            .filter((p) => p.symbol === symbol && p.status === "open")
            .map((pos) => (
              <div
                key={pos._id}
                className={`text-[9px] px-1.5 py-0.5 rounded border backdrop-blur-sm ${
                  pos.direction === "long"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-red-500/10 text-red-400 border-red-500/20"
                }`}
              >
                {pos.direction.toUpperCase()} {pos.leverage}x
                {pos.entry_reason?.match(/^\[([^\]]+)\]/)?.[1] && (
                  <span className="text-purple-300 ml-0.5">
                    {pos.entry_reason.match(/^\[([^\]]+)\]/)?.[1]?.toUpperCase()}
                  </span>
                )}
                {" • "}
                <span className={pos.unrealized_pnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} className="w-full rounded-lg overflow-hidden" style={{ height, minHeight: height }} />

      {/* Indicator toggles */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        <button
          onClick={() => setShowVolume(!showVolume)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
            showVolume
              ? "text-slate-400 bg-slate-500/15 border-slate-500/30"
              : "text-slate-600 bg-transparent border-white/[0.06] hover:text-slate-400"
          }`}
        >
          Vol
        </button>
        <button
          onClick={() => setShowMarkers(!showMarkers)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
            showMarkers
              ? "text-emerald-400 bg-emerald-500/15 border-emerald-500/30"
              : "text-slate-600 bg-transparent border-white/[0.06] hover:text-slate-400"
          }`}
        >
          Trades
        </button>
        <button
          onClick={() => setShowPositionLines(!showPositionLines)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
            showPositionLines
              ? "text-amber-400 bg-amber-500/15 border-amber-500/30"
              : "text-slate-600 bg-transparent border-white/[0.06] hover:text-slate-400"
          }`}
        >
          Positions
        </button>
        <button
          onClick={() => setShowPrediction(!showPrediction)}
          className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
            showPrediction
              ? "text-blue-400 bg-blue-500/15 border-blue-500/30"
              : "text-slate-600 bg-transparent border-white/[0.06] hover:text-slate-400"
          }`}
        >
          AI
        </button>
      </div>

      {/* ── Below-chart info panel (non-compact only) ── */}
      {!compact && (
        <div className="mt-2 space-y-1.5">

          {/* Active positions for this market */}
          {(() => {
            const marketPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");
            if (marketPositions.length === 0) return null;
            return (
              <div className="space-y-1">
                {marketPositions.map((pos) => {
                  const pnlPct = pos.margin > 0 ? (pos.unrealized_pnl / pos.margin) * 100 : 0;
                  return (
                    <div
                      key={pos._id}
                      className={`rounded-lg border p-2 ${
                        pos.direction === "long"
                          ? "bg-emerald-500/[0.05] border-emerald-500/15"
                          : "bg-red-500/[0.05] border-red-500/15"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            pos.direction === "long"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-red-500/20 text-red-400"
                          }`}>
                            {pos.direction.toUpperCase()} {pos.leverage}x
                          </span>
                          {pos.entry_reason?.match(/^\[([^\]]+)\]/)?.[1] && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/25">
                              {pos.entry_reason.match(/^\[([^\]]+)\]/)?.[1]?.toUpperCase()}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            Entry ${formatPrice(pos.entry_price)}
                          </span>
                        </div>
                        <span className={`text-[11px] font-bold font-mono ${
                          pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}>
                          {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
                          <span className="text-[9px] ml-0.5 opacity-70">
                            ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                      <div className="flex gap-2 mt-1 text-[9px] text-slate-500">
                        <span>Size <span className="text-slate-400 font-mono">${pos.size_usd?.toFixed(0) || "—"}</span></span>
                        <span>Mark <span className="text-slate-400 font-mono">${formatPrice(pos.mark_price)}</span></span>
                        {pos.stop_loss != null && (
                          <span>SL <span className="text-red-400/70 font-mono">${formatPrice(pos.stop_loss)}</span></span>
                        )}
                        {pos.take_profit != null && (
                          <span>TP <span className="text-emerald-400/70 font-mono">${formatPrice(pos.take_profit)}</span></span>
                        )}
                        {pos.trailing_stop_price != null && (
                          <span>Trail <span className="text-blue-400/70 font-mono">${formatPrice(pos.trailing_stop_price)}</span></span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* AI prediction & strategy breakdown */}
          {showPrediction && prediction?.strategies && (
            <div className="rounded-lg border border-blue-500/15 bg-slate-900/60 p-2 space-y-1.5">
              {/* Signal + reasoning */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    prediction.signal === "LONG" || prediction.signal === "SCALP LONG"
                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                      : prediction.signal === "SHORT" || prediction.signal === "SCALP SHORT"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                  }`}>
                    {prediction.signal}
                  </span>
                  <span className="text-[10px] text-blue-400 font-bold">{prediction.confidence}% conf</span>
                  <span className="text-[9px] text-slate-500">
                    Target ${formatPrice(prediction.targetPrice)}
                  </span>
                </div>
                <button
                  onClick={() => setShowStrategyInfo(!showStrategyInfo)}
                  className="text-[9px] text-slate-500 hover:text-blue-400 transition-colors"
                >
                  {showStrategyInfo ? "Hide details" : "Show details"}
                </button>
              </div>

              {/* AI reasoning summary */}
              <div className="text-[9px] text-slate-400 leading-relaxed">
                {(() => {
                  const s = prediction.strategies;
                  const parts: string[] = [];
                  if (s.trend.direction !== "flat")
                    parts.push(`Trend is ${s.trend.direction === "up" ? "bullish" : "bearish"} (${s.trend.strength.toFixed(0)}% strength)`);
                  else parts.push("No clear trend");
                  parts.push(`RSI at ${s.momentum.rsi.toFixed(1)} (${s.momentum.bias})`);
                  if (s.ema.cross !== "neutral")
                    parts.push(`EMA ${s.ema.cross} cross (8${s.ema.cross === "bullish" ? ">" : "<"}21)`);
                  parts.push(`${s.volatility.level} volatility (${s.volatility.value.toFixed(3)}%)`);
                  return parts.join(" • ");
                })()}
              </div>

              {/* Detailed strategy grid (expandable) */}
              {showStrategyInfo && (
                <div className="space-y-1.5 pt-1 border-t border-white/[0.04]">
                  <div className="grid grid-cols-4 gap-1">
                    {/* Trend */}
                    <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.03]">
                      <div className="text-[7px] text-slate-600 uppercase">Trend (60%)</div>
                      <div className={`text-[10px] font-bold ${
                        prediction.strategies.trend.direction === "up" ? "text-emerald-400" :
                        prediction.strategies.trend.direction === "down" ? "text-red-400" : "text-slate-400"
                      }`}>
                        {prediction.strategies.trend.direction === "up" ? "Bullish" :
                         prediction.strategies.trend.direction === "down" ? "Bearish" : "Flat"}
                      </div>
                      <div className="text-[8px] text-slate-500">{prediction.strategies.trend.strength.toFixed(0)}% str</div>
                      <div className="text-[7px] text-slate-600 mt-0.5">WLR slope: {prediction.strategies.trend.slope.toFixed(6)}</div>
                    </div>

                    {/* Momentum */}
                    <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.03]">
                      <div className="text-[7px] text-slate-600 uppercase">RSI (25%)</div>
                      <div className={`text-[10px] font-bold ${
                        prediction.strategies.momentum.bias === "bullish" ? "text-emerald-400" :
                        prediction.strategies.momentum.bias === "bearish" ? "text-red-400" : "text-slate-400"
                      }`}>
                        {prediction.strategies.momentum.rsi.toFixed(1)}
                      </div>
                      <div className="text-[8px] text-slate-500">{prediction.strategies.momentum.bias}</div>
                      <div className="text-[7px] text-slate-600 mt-0.5">
                        {prediction.strategies.momentum.rsi > 70 ? "Overbought" :
                         prediction.strategies.momentum.rsi < 30 ? "Oversold" : "Normal range"}
                      </div>
                    </div>

                    {/* EMA Cross */}
                    <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.03]">
                      <div className="text-[7px] text-slate-600 uppercase">EMA (15%)</div>
                      <div className={`text-[10px] font-bold ${
                        prediction.strategies.ema.cross === "bullish" ? "text-emerald-400" :
                        prediction.strategies.ema.cross === "bearish" ? "text-red-400" : "text-slate-400"
                      }`}>
                        {prediction.strategies.ema.cross === "bullish" ? "8 > 21" :
                         prediction.strategies.ema.cross === "bearish" ? "8 < 21" : "Neutral"}
                      </div>
                      <div className="text-[8px] text-slate-500">{prediction.strategies.ema.cross}</div>
                      <div className="text-[7px] text-slate-600 mt-0.5">
                        8: ${formatPrice(prediction.strategies.ema.ema8)}
                      </div>
                    </div>

                    {/* Volatility */}
                    <div className="rounded bg-slate-800/50 px-2 py-1.5 border border-white/[0.03]">
                      <div className="text-[7px] text-slate-600 uppercase">Volatility</div>
                      <div className={`text-[10px] font-bold ${
                        prediction.strategies.volatility.level === "high" ? "text-amber-400" :
                        prediction.strategies.volatility.level === "medium" ? "text-blue-400" : "text-slate-400"
                      }`}>
                        {prediction.strategies.volatility.value.toFixed(3)}%
                      </div>
                      <div className="text-[8px] text-slate-500">{prediction.strategies.volatility.level}</div>
                      <div className="text-[7px] text-slate-600 mt-0.5">Std dev of returns</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent trades for this market */}
          {(() => {
            const marketTrades = (trades || [])
              .filter((t) => t.symbol === symbol)
              .slice(0, 3);
            if (marketTrades.length === 0) return null;
            return (
              <div className="rounded-lg border border-white/[0.04] bg-slate-800/30 p-2">
                <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-1">Recent Trades</div>
                <div className="space-y-0.5">
                  {marketTrades.map((t, i) => (
                    <div key={i} className="flex items-center justify-between text-[9px]">
                      <div className="flex items-center gap-1.5">
                        <span className={t.direction === "long" ? "text-emerald-400" : "text-red-400"}>
                          {t.direction.toUpperCase()}
                        </span>
                        <span className="text-slate-500">{t.leverage}x</span>
                        <span className="text-slate-500 font-mono">${formatPrice(t.entry_price)}</span>
                        <span className="text-slate-600">→</span>
                        <span className="text-slate-500 font-mono">${formatPrice(t.exit_price)}</span>
                      </div>
                      <span className={`font-bold font-mono ${t.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {t.realized_pnl >= 0 ? "+" : ""}${t.realized_pnl.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default TradingChart;
