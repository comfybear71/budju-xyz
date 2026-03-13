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
  height?: number;
  compact?: boolean;
}

interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ── Helpers ──────────────────────────────────────────────────

const BINANCE_REST = "https://api.binance.com/api/v3/klines";

async function fetchHistoricalKlines(
  binanceSymbol: string,
  interval = "1m",
  limit = 500,
): Promise<CandleData[]> {
  const symbol = binanceSymbol.toUpperCase();
  const url = `${BINANCE_REST}?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: (Math.floor(k[0] / 1000)) as Time,
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
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

interface AIEntryZone {
  longEntry: number;   // Price where AI would trigger a long
  shortEntry: number;  // Price where AI would trigger a short
  bbUpper: number;     // Upper Bollinger Band
  bbLower: number;     // Lower Bollinger Band
  bbMiddle: number;    // Middle band (SMA 20)
  ema50: number;       // 50-period EMA trend filter
  longReady: boolean;  // All conditions met for long (trend + RSI)
  shortReady: boolean; // All conditions met for short (trend + RSI)
  longReason: string;  // Why long is ready/blocked
  shortReason: string; // Why short is ready/blocked
}

interface Prediction {
  points: { time: Time; value: number }[];
  signal: Signal;
  confidence: number; // 0-100
  targetPrice: number;
  strategies?: StrategyBreakdown;
  entryZones?: AIEntryZone;
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
    const futureTime = (lastTime + i * 60) as Time; // 1m candles
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

  // 9. AI Entry Zones — compute Bollinger Bands + EMA50 + RSI conditions
  // Matches server-side strategy triggers: price level + RSI + trend filter must ALL align
  const bbPeriod = 20;
  const bbStd = 2.0;
  const ema50Period = 50;

  let entryZones: AIEntryZone | undefined;
  if (closes.length >= bbPeriod) {  // Only need 20 candles (BB period), EMA50 adapts
    // Bollinger Bands
    const bbSlice = closes.slice(-bbPeriod);
    const bbMean = bbSlice.reduce((s, v) => s + v, 0) / bbPeriod;
    const bbVariance = bbSlice.reduce((s, v) => s + (v - bbMean) ** 2, 0) / bbPeriod;
    const bbStdDev = Math.sqrt(bbVariance);
    const bbUpper = bbMean + bbStd * bbStdDev;
    const bbLower = bbMean - bbStd * bbStdDev;

    // EMA 50 (trend filter) — adapts to available data, min 20 candles
    const emaLen = Math.min(ema50Period, closes.length);
    const ema50Slice = closes.slice(-emaLen);
    let ema50Val = ema50Slice[0];
    const k50 = 2 / (emaLen + 1);
    for (let i = 1; i < ema50Slice.length; i++) {
      ema50Val = ema50Slice[i] * k50 + ema50Val * (1 - k50);
    }

    // Long entry: blend of lower BB, EMA support, and current price — moves dynamically
    const longBB = bbLower;
    const longEMA = Math.min(ema50Val, currentPrice * 0.998);
    const longEntry = longBB * 0.4 + longEMA * 0.3 + currentPrice * 0.997 * 0.3;
    // Short entry: blend of upper BB, EMA resistance, and current price — moves dynamically
    const shortBB = bbUpper;
    const shortEMA = Math.max(ema50Val, currentPrice * 1.002);
    const shortEntry = shortBB * 0.4 + shortEMA * 0.3 + currentPrice * 1.003 * 0.3;

    // Check if conditions are met (matching server-side perp_strategies.py logic)
    // Long requires: price above EMA50 (trend filter) + RSI not overbought
    const trendAllowsLong = currentPrice > ema50Val;
    const rsiAllowsLong = rsi < 70; // Not overbought
    const longReady = trendAllowsLong && rsiAllowsLong;
    let longReason = "";
    if (longReady) {
      longReason = "Trend + RSI aligned";
    } else {
      const blocks: string[] = [];
      if (!trendAllowsLong) blocks.push("price below EMA50");
      if (!rsiAllowsLong) blocks.push(`RSI overbought (${rsi.toFixed(0)})`);
      longReason = `Blocked: ${blocks.join(", ")}`;
    }

    // Short requires: price below EMA50 (trend filter) + RSI not oversold
    const trendAllowsShort = currentPrice < ema50Val;
    const rsiAllowsShort = rsi > 30; // Not oversold
    const shortReady = trendAllowsShort && rsiAllowsShort;
    let shortReason = "";
    if (shortReady) {
      shortReason = "Trend + RSI aligned";
    } else {
      const blocks: string[] = [];
      if (!trendAllowsShort) blocks.push("price above EMA50");
      if (!rsiAllowsShort) blocks.push(`RSI oversold (${rsi.toFixed(0)})`);
      shortReason = `Blocked: ${blocks.join(", ")}`;
    }

    entryZones = {
      longEntry,
      shortEntry,
      bbUpper,
      bbLower,
      bbMiddle: bbMean,
      ema50: ema50Val,
      longReady,
      shortReady,
      longReason,
      shortReason,
    };
  }

  return { points, signal, confidence: Math.max(confidence, 10), targetPrice, strategies, entryZones };
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

  const [chartMode, setChartMode] = useState<"candle" | "line">("candle");
  const [livePrice, setLivePrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [showPrediction, setShowPrediction] = useState(true);
  const [showStrategyInfo, setShowStrategyInfo] = useState(false);
  const lastEntryZonesRef = useRef<AIEntryZone | null>(null);

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
        rightOffset: 20,
        barSpacing: 4,
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
      lastValueVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
      drawTicks: false,
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
      const historical = await fetchHistoricalKlines(binanceSymbol, "1m", 500);
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

        // Default zoom: show last ~200 candles (~3.3 hrs) for good overview
        // Use scrollToRealTime() which respects rightOffset for right-side padding
        if (chartRef.current && historical.length > 200) {
          const fromTime = historical[historical.length - 200].time;
          const toTime = historical[historical.length - 1].time;
          chartRef.current.timeScale().setVisibleRange({ from: fromTime, to: toTime });
          chartRef.current.timeScale().scrollToRealTime();
        }
      }

      // Add trade markers
      addTradeMarkers();
      // Add position lines
      addPositionLines();

      // Compute initial prediction + AI entry zones
      if (showPrediction && historical.length >= 50) {
        const pred = computePrediction(historical, Math.min(60, historical.length - 1));
        if (pred && predictionSeriesRef.current) {
          predictionSeriesRef.current.setData(pred.points);
          setPrediction(pred);
          if (pred.entryZones) addAIEntryZones(pred.entryZones);
        }
      } else if (showPrediction && lastEntryZonesRef.current) {
        // Re-apply cached AI zones (e.g., after chart re-init)
        addAIEntryZones(lastEntryZonesRef.current);
      }

      setLoading(false);

      // Start kline WebSocket
      const stream = new BinanceKlineStream(binanceSymbol, "1m");
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
            if (pred.entryZones) addAIEntryZones(pred.entryZones);
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
    if (!candleSeriesRef.current || trades.length === 0) return;

    const candles = dataRef.current;
    if (candles.length === 0) return;

    // Build a set of valid candle timestamps for snapping
    const candleTimes = candles.map((c) => c.time as number);
    const chartStart = candleTimes[0];
    const chartEnd = candleTimes[candleTimes.length - 1];

    // Snap a timestamp to the nearest candle in range, or null if out of range
    const snapToCandle = (unixSec: number): number | null => {
      if (unixSec < chartStart || unixSec > chartEnd + 60) return null;
      // Binary search for nearest candle
      let lo = 0, hi = candleTimes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candleTimes[mid] < unixSec) lo = mid + 1;
        else hi = mid;
      }
      // Check if lo or lo-1 is closer
      if (lo > 0 && Math.abs(candleTimes[lo - 1] - unixSec) < Math.abs(candleTimes[lo] - unixSec)) {
        return candleTimes[lo - 1];
      }
      return candleTimes[lo];
    };

    const markers: SeriesMarker<Time>[] = [];

    for (const trade of trades) {
      if (trade.symbol !== symbol) continue;

      // Snap entry time to nearest candle — skip if out of chart range
      const entryUnix = Math.floor(new Date(trade.entry_time).getTime() / 1000);
      const snappedEntry = snapToCandle(entryUnix);
      if (snappedEntry !== null) {
        markers.push({
          time: snappedEntry as Time,
          position: trade.direction === "long" ? "belowBar" : "aboveBar",
          color: trade.direction === "long" ? "#22c55e" : "#ef4444",
          shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
          text: trade.direction === "long" ? "L" : "S",
        });
      }

      // Snap exit time to nearest candle
      if (trade.exit_time) {
        const exitUnix = Math.floor(new Date(trade.exit_time).getTime() / 1000);
        const snappedExit = snapToCandle(exitUnix);
        if (snappedExit !== null) {
          const isProfitable = trade.realized_pnl >= 0;
          const pnl = Math.abs(trade.realized_pnl);
          markers.push({
            time: snappedExit as Time,
            position: "aboveBar",
            color: isProfitable ? "#a855f7" : "#f59e0b",
            shape: "circle",
            text: `${isProfitable ? "+" : "-"}$${pnl < 100 ? pnl.toFixed(1) : pnl.toFixed(0)}`,
          });
        }
      }
    }

    // Sort by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    candleSeriesRef.current.setMarkers(markers);
  }, [trades, symbol]);

  // ── Position Lines (entry price, SL, TP) ───────────────────

  const addPositionLines = useCallback(() => {
    if (!candleSeriesRef.current) return;

    const myPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");

    for (const pos of myPositions) {
      // Entry price line — transparent, no axis label
      const dirLabel = pos.direction === "long" ? "L" : "S";
      candleSeriesRef.current.createPriceLine({
        price: pos.entry_price,
        color: pos.direction === "long" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: `${dirLabel} ${pos.leverage}x`,
      });

      // Stop loss line — transparent, no axis label
      if (pos.stop_loss) {
        candleSeriesRef.current.createPriceLine({
          price: pos.stop_loss,
          color: "rgba(245,158,11,0.35)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        });
      }

      // Take profit line — transparent, no axis label
      if (pos.take_profit) {
        candleSeriesRef.current.createPriceLine({
          price: pos.take_profit,
          color: "rgba(168,85,247,0.35)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        });
      }

      // Liquidation line — transparent, no axis label
      if (pos.liquidation_price) {
        candleSeriesRef.current.createPriceLine({
          price: pos.liquidation_price,
          color: "rgba(220,38,38,0.35)",
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: false,
          title: "",
        });
      }
    }
  }, [positions, symbol]);

  // ── AI Entry Zone Lines ────────────────────────────────────

  const aiLinesRef = useRef<any[]>([]);

  const addAIEntryZones = useCallback((zones: AIEntryZone) => {
    if (!candleSeriesRef.current) return;
    lastEntryZonesRef.current = zones;

    // Remove previous AI lines
    for (const line of aiLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(line); } catch { /* noop */ }
    }
    aiLinesRef.current = [];

    // AI Long entry target — line label only, no axis price
    aiLinesRef.current.push(
      candleSeriesRef.current.createPriceLine({
        price: zones.longEntry,
        color: "#22c55e",
        lineWidth: 2,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: false,
        title: "",
      })
    );

    // AI Short entry target — line label only, no axis price
    aiLinesRef.current.push(
      candleSeriesRef.current.createPriceLine({
        price: zones.shortEntry,
        color: "#ef4444",
        lineWidth: 2,
        lineStyle: LineStyle.LargeDashed,
        axisLabelVisible: false,
        title: "",
      })
    );
  }, []);

  // ── Toggle chart mode ──────────────────────────────────────

  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: chartMode === "candle" });
    lineSeriesRef.current?.applyOptions({ visible: chartMode === "line" });
  }, [chartMode]);

  // ── Toggle prediction visibility ─────────────────────────

  useEffect(() => {
    predictionSeriesRef.current?.applyOptions({ visible: showPrediction });
  }, [showPrediction]);

  // ── Render ─────────────────────────────────────────────────

  const isPositive = priceChange >= 0;

  return (
    <div className="relative">
      {/* Header */}
      <div className={`${compact ? "mb-1" : "mb-2"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
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
          <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          {/* Signal badge — click for strategy breakdown */}
          {showPrediction && prediction && !compact && (
            <button
              onClick={() => setShowStrategyInfo(!showStrategyInfo)}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border cursor-pointer transition-all ${
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
          {/* Compact signal dot */}
          {showPrediction && prediction && compact && (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                prediction.signal === "LONG" || prediction.signal === "SCALP LONG"
                  ? "bg-emerald-400"
                  : prediction.signal === "SHORT" || prediction.signal === "SCALP SHORT"
                    ? "bg-red-400"
                    : "bg-slate-400"
              }`}
              title={`${prediction.signal} (${prediction.confidence}%)`}
            />
          )}
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
          {/* AI Prediction toggle */}
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border transition-colors ${
              showPrediction
                ? "text-blue-400 bg-blue-500/15 border-blue-500/30"
                : "text-slate-500 border-white/[0.06] hover:text-blue-400"
            }`}
            title="Toggle AI prediction"
          >
            AI
          </button>
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
                {pos.direction.toUpperCase()} {pos.leverage}x •{" "}
                <span className={pos.unrealized_pnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                  {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* Chart container */}
      <style>{`
        .trading-chart-wrap [class*="pane"] div[style*="position: absolute"][style*="z-index"],
        .trading-chart-wrap td[style*="padding"] > div > div[style*="position: absolute"] {
          border-radius: 4px !important;
          opacity: 0.85 !important;
        }
      `}</style>
      <div ref={containerRef} className="trading-chart-wrap w-full rounded-lg overflow-hidden" />

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

          {/* AI Planned Entry Zones */}
          {showPrediction && prediction?.entryZones && (
            <div className="rounded-lg border border-cyan-500/15 bg-gradient-to-r from-cyan-950/20 via-slate-900/40 to-cyan-950/20 p-2">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[8px] text-cyan-500/80 uppercase tracking-wider font-bold">AI Trading Genius — Next Moves</span>
                <span className="text-[7px] text-slate-600">Executes when price + conditions align</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Long entry zone — always bright */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.08] p-2 transition-all">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px]">{"\u2191"}</span>
                    <span className="text-[9px] font-bold text-emerald-400">
                      LONG ENTRY
                    </span>
                    {prediction.entryZones.longReady ? (
                      <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold animate-pulse">READY</span>
                    ) : (
                      <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400/80 font-bold">WAITING</span>
                    )}
                  </div>
                  <div className="text-[13px] font-bold font-mono text-emerald-300">
                    ${formatPrice(prediction.entryZones.longEntry)}
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">
                    {(() => {
                      const dist = ((livePrice - prediction.entryZones.longEntry) / livePrice) * 100;
                      return `${dist.toFixed(2)}% below current`;
                    })()}
                  </div>
                  <div className={`text-[7px] mt-0.5 ${prediction.entryZones.longReady ? "text-emerald-500/70" : "text-amber-500/60"}`}>
                    {prediction.entryZones.longReason}
                  </div>
                </div>
                {/* Short entry zone — always bright */}
                <div className="rounded-lg border border-red-500/30 bg-red-500/[0.08] p-2 transition-all">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="text-[10px]">{"\u2193"}</span>
                    <span className="text-[9px] font-bold text-red-400">
                      SHORT ENTRY
                    </span>
                    {prediction.entryZones.shortReady ? (
                      <span className="text-[7px] px-1 py-0.5 rounded bg-red-500/20 text-red-300 font-bold animate-pulse">READY</span>
                    ) : (
                      <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-400/80 font-bold">WAITING</span>
                    )}
                  </div>
                  <div className="text-[13px] font-bold font-mono text-red-300">
                    ${formatPrice(prediction.entryZones.shortEntry)}
                  </div>
                  <div className="text-[8px] text-slate-500 mt-0.5">
                    {(() => {
                      const dist = ((prediction.entryZones.shortEntry - livePrice) / livePrice) * 100;
                      return `${dist.toFixed(2)}% above current`;
                    })()}
                  </div>
                  <div className={`text-[7px] mt-0.5 ${prediction.entryZones.shortReady ? "text-red-500/70" : "text-amber-500/60"}`}>
                    {prediction.entryZones.shortReason}
                  </div>
                </div>
              </div>
              {/* BB & EMA50 reference levels */}
              <div className="flex gap-3 mt-1.5 text-[8px] text-slate-500">
                <span>BB Upper <span className="text-red-400/60 font-mono">${formatPrice(prediction.entryZones.bbUpper)}</span></span>
                <span>BB Mid <span className="text-slate-400/60 font-mono">${formatPrice(prediction.entryZones.bbMiddle)}</span></span>
                <span>BB Lower <span className="text-emerald-400/60 font-mono">${formatPrice(prediction.entryZones.bbLower)}</span></span>
                <span>EMA50 <span className="text-cyan-400/60 font-mono">${formatPrice(prediction.entryZones.ema50)}</span></span>
              </div>
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
