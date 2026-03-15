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

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
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
import type { PerpPosition, PerpTrade, PerpPendingOrder } from "../../types/perps";
import type { StrategyStatus } from "../../services/perpApi";

// ── Types ────────────────────────────────────────────────────

interface Props {
  symbol: string; // e.g. "SOL-PERP"
  baseAsset: string; // e.g. "SOL"
  positions?: PerpPosition[];
  trades?: PerpTrade[];
  pendingOrders?: PerpPendingOrder[];
  height?: number;
  compact?: boolean;
  loadDelay?: number; // accepted for compatibility with MobileAreaChart
  strategyStatus?: StrategyStatus | null;
  onModifySLTP?: (positionId: string, mods: { stopLoss?: number; takeProfit?: number }) => void;
  onModifyPendingOrder?: (orderId: string, mods: { triggerPrice?: number; direction?: string; stopLoss?: number; takeProfit?: number }) => void;
  onCancelPendingOrder?: (orderId: string) => void;
  onClosePosition?: (positionId: string, exitPrice: number) => void;
  /** Injected content rendered immediately after the chart canvas (before toggles/expandable panels) */
  children?: React.ReactNode;
}

// Drag state for SL/TP/pending order lines
interface DragState {
  active: boolean;
  type: "sl" | "tp" | "pending";
  positionId: string; // position or order ID
  priceLine: any;
  startPrice: number;
  orderType?: string; // "stop" | "limit" — for pending orders
  orderDirection?: string; // "long" | "short" — for pending orders
}

interface CandleData {
  time: Time;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
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
        volume: parseFloat(k[5]) || 0,
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
  pendingOrders = [],
  onModifySLTP,
  onModifyPendingOrder,
  onCancelPendingOrder,
  children,
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
  const positionFingerprintRef = useRef<string>("");

  // SL/TP/pending draggable line refs — separate from priceLinesRef so we can identify them
  const slTpLinesRef = useRef<Map<string, { type: "sl" | "tp" | "pending"; positionId: string; priceLine: any; orderType?: string; orderDirection?: string }>>(new Map());
  const dragRef = useRef<DragState | null>(null);
  const [dragPrice, setDragPrice] = useState<{ type: "sl" | "tp" | "pending"; price: number } | null>(null);

  const [timeframe, setTimeframe] = useState<"5m" | "30m" | "1h">("1h");
  const [chartMode, setChartMode] = useState<"candle" | "line">("candle");
  const [livePrice, setLivePrice] = useState(0);
  const livePriceRef = useRef(0);
  const [priceChange, setPriceChange] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [showPrediction, setShowPrediction] = useState(false);
  const [showMarkers, setShowMarkers] = useState(false);
  const [showPositionLines, setShowPositionLines] = useState(false);
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

      // Fetch historical klines from Binance REST
      const historical = await fetchHistoricalKlines(binanceSymbol, timeframe, 500);
      dataRef.current = historical;

      if (candleSeriesRef.current && historical.length > 0) {
        candleSeriesRef.current.setData(historical);
        lineSeriesRef.current?.setData(
          historical.map((c) => ({ time: c.time, value: c.close })),
        );
        volumeSeriesRef.current?.setData(
          historical.map((c) => ({
            time: c.time,
            value: c.volume || 0,
            color: c.close >= c.open ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)",
          })),
        );

        // Set initial price
        const last = historical[historical.length - 1];
        if (last) {
          setLivePrice(last.close);
          livePriceRef.current = last.close;
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
      const stream = new BinanceKlineStream(binanceSymbol, timeframe);
      klineStreamRef.current = stream;
      stream.connect();

      const unsub = stream.onBar((bar: KlineBar) => {
        setConnected(true);
        setLivePrice(bar.close);
        livePriceRef.current = bar.close;

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
  }, [binanceSymbol, timeframe, initChart]);

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

  const addPositionLines = useCallback((force = false) => {
    if (!candleSeriesRef.current) return;

    // Build fingerprint to avoid rebuilding lines when nothing changed
    const myPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");
    const myOrders = pendingOrders.filter((o) => o.symbol === symbol && o.status === "pending");
    const fingerprint = JSON.stringify({
      show: showPositionLines,
      pos: myPositions.map((p) => `${p._id}:${p.entry_price}:${p.stop_loss}:${p.take_profit}`),
      ord: myOrders.map((o) => `${o._id}:${o.trigger_price}`),
    });
    if (!force && fingerprint === positionFingerprintRef.current) return;
    positionFingerprintRef.current = fingerprint;

    // Remove existing price lines
    for (const line of priceLinesRef.current) {
      try { candleSeriesRef.current.removePriceLine(line); } catch { /* already removed */ }
    }
    priceLinesRef.current = [];
    slTpLinesRef.current.clear();

    if (!showPositionLines) return;

    for (const pos of myPositions) {
      const isLong = pos.direction === "long";
      // Entry — thin dotted line, short label
      priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
        price: pos.entry_price,
        color: isLong ? "rgba(34, 197, 94, 0.6)" : "rgba(239, 68, 68, 0.6)",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: isLong ? "L" : "S",
      }));

      // SL — draggable line
      if (pos.stop_loss) {
        const slLine = candleSeriesRef.current.createPriceLine({
          price: pos.stop_loss,
          color: onModifySLTP ? "rgba(245, 158, 11, 0.7)" : "rgba(245, 158, 11, 0.4)",
          lineWidth: onModifySLTP ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "SL",
        });
        priceLinesRef.current.push(slLine);
        if (onModifySLTP) {
          slTpLinesRef.current.set(`sl-${pos._id}`, { type: "sl", positionId: pos._id, priceLine: slLine });
        }
      }

      // TP — draggable line
      if (pos.take_profit) {
        const tpLine = candleSeriesRef.current.createPriceLine({
          price: pos.take_profit,
          color: onModifySLTP ? "rgba(168, 85, 247, 0.7)" : "rgba(168, 85, 247, 0.4)",
          lineWidth: onModifySLTP ? 2 : 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "TP",
        });
        priceLinesRef.current.push(tpLine);
        if (onModifySLTP) {
          slTpLinesRef.current.set(`tp-${pos._id}`, { type: "tp", positionId: pos._id, priceLine: tpLine });
        }
      }

      // LIQ — faint dotted, only if within 15% of price
      if (pos.liquidation_price) {
        const liqDist = Math.abs(pos.liquidation_price - pos.entry_price) / pos.entry_price;
        if (liqDist < 0.15) {
          priceLinesRef.current.push(candleSeriesRef.current.createPriceLine({
            price: pos.liquidation_price,
            color: "rgba(220, 38, 38, 0.3)",
            lineWidth: 1,
            lineStyle: LineStyle.SparseDotted,
            axisLabelVisible: false,
            title: "",
          }));
        }
      }
    }
    // ── Pending Orders — draggable trigger price lines ──
    for (const order of myOrders) {
      const isLong = order.direction === "long";
      const canDrag = !!onModifyPendingOrder;
      const label = order.order_type === "limit"
        ? (isLong ? "B LMT" : "S LMT")
        : (isLong ? "B STP" : "S STP");

      const pendingLine = candleSeriesRef.current.createPriceLine({
        price: order.trigger_price,
        color: isLong
          ? (canDrag ? "rgba(6, 182, 212, 0.7)" : "rgba(6, 182, 212, 0.5)")
          : (canDrag ? "rgba(249, 115, 22, 0.7)" : "rgba(249, 115, 22, 0.5)"),
        lineWidth: canDrag ? 2 : 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: label,
      });
      priceLinesRef.current.push(pendingLine);
      if (canDrag) {
        slTpLinesRef.current.set(`pending-${order._id}`, { type: "pending" as any, positionId: order._id, priceLine: pendingLine, orderType: order.order_type, orderDirection: order.direction });
      }
    }
  }, [positions, pendingOrders, symbol, showPositionLines, onModifySLTP, onModifyPendingOrder]);

  // ── SL/TP Drag Handlers ──────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!container || !chart || !series || (!onModifySLTP && !onModifyPendingOrder)) return;

    const SNAP_PX = 20; // pixels proximity to grab a line

    const getPrice = (y: number): number | null => {
      try {
        const price = series.coordinateToPrice(y);
        return typeof price === "number" && isFinite(price) ? price : null;
      } catch { return null; }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const mousePrice = getPrice(y);
      if (!mousePrice) return;

      // Find nearest SL/TP line within snap distance
      let nearest: { key: string; dist: number } | null = null;
      for (const [key, info] of slTpLinesRef.current) {
        const linePrice = info.priceLine.options().price;
        const lineY = series.priceToCoordinate(linePrice);
        if (lineY === null) continue;
        const dist = Math.abs(y - lineY);
        if (dist < SNAP_PX && (!nearest || dist < nearest.dist)) {
          nearest = { key, dist };
        }
      }

      if (!nearest) return;
      const info = slTpLinesRef.current.get(nearest.key)!;
      e.preventDefault();
      e.stopPropagation();

      // Disable chart scrolling during drag
      chart.applyOptions({
        handleScroll: { mouseWheel: false, pressedMouseMove: false },
        handleScale: { mouseWheel: false, pinch: false },
      });

      dragRef.current = {
        active: true,
        type: info.type,
        positionId: info.positionId,
        priceLine: info.priceLine,
        startPrice: info.priceLine.options().price,
        orderType: info.orderType,
        orderDirection: info.orderDirection,
      };
      container.style.cursor = "ns-resize";
      setDragPrice({ type: info.type, price: info.priceLine.options().price });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) {
        // Show grab cursor when hovering near SL/TP lines
        const rect = container.getBoundingClientRect();
        const y = e.clientY - rect.top;
        let nearLine = false;
        for (const [, info] of slTpLinesRef.current) {
          const lineY = series.priceToCoordinate(info.priceLine.options().price);
          if (lineY !== null && Math.abs(y - lineY) < SNAP_PX) {
            nearLine = true;
            break;
          }
        }
        container.style.cursor = nearLine ? "ns-resize" : "";
        return;
      }

      const rect = container.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const newPrice = getPrice(y);
      if (!newPrice || newPrice <= 0) return;

      e.preventDefault();

      // For pending orders, update label/color when dragged across current price
      const curPrice = livePriceRef.current;
      if (drag.type === "pending" && drag.orderType && drag.orderDirection && curPrice > 0) {
        let effectiveDir = drag.orderDirection;
        if (drag.orderType === "stop") {
          if (drag.orderDirection === "long" && newPrice < curPrice) effectiveDir = "short";
          else if (drag.orderDirection === "short" && newPrice > curPrice) effectiveDir = "long";
        } else if (drag.orderType === "limit") {
          if (drag.orderDirection === "long" && newPrice > curPrice) effectiveDir = "short";
          else if (drag.orderDirection === "short" && newPrice < curPrice) effectiveDir = "long";
        }
        const label = drag.orderType === "limit"
          ? (effectiveDir === "long" ? "B LMT" : "S LMT")
          : (effectiveDir === "long" ? "B STP" : "S STP");
        const color = effectiveDir === "long"
          ? "rgba(6, 182, 212, 0.7)"
          : "rgba(249, 115, 22, 0.7)";
        drag.priceLine.applyOptions({ price: newPrice, title: label, color });
      } else {
        drag.priceLine.applyOptions({ price: newPrice });
      }
      setDragPrice({ type: drag.type, price: newPrice });
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag?.active) return;

      const finalPrice = drag.priceLine.options().price;
      container.style.cursor = "";

      // Re-enable chart interaction
      chart.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });

      // Call modify API if price actually changed
      if (Math.abs(finalPrice - drag.startPrice) > 0.0001) {
        if (drag.type === "pending") {
          const mods: { triggerPrice: number; direction?: string } = { triggerPrice: finalPrice };
          // Auto-flip direction for stop orders when dragged across current price
          // BUY STOP above price → drag below price = SELL STOP
          // SELL STOP below price → drag above price = BUY STOP
          // Same logic for limit orders (reversed)
          const cp = livePriceRef.current;
          if (drag.orderType === "stop" && drag.orderDirection && cp > 0) {
            if (drag.orderDirection === "long" && finalPrice < cp) {
              mods.direction = "short"; // BUY STOP → SELL STOP
            } else if (drag.orderDirection === "short" && finalPrice > cp) {
              mods.direction = "long"; // SELL STOP → BUY STOP
            }
          } else if (drag.orderType === "limit" && drag.orderDirection && cp > 0) {
            if (drag.orderDirection === "long" && finalPrice > cp) {
              mods.direction = "short"; // BUY LIMIT → SELL LIMIT
            } else if (drag.orderDirection === "short" && finalPrice < cp) {
              mods.direction = "long"; // SELL LIMIT → BUY LIMIT
            }
          }
          onModifyPendingOrder?.(drag.positionId, mods);
        } else {
          const mods = drag.type === "sl"
            ? { stopLoss: finalPrice }
            : { takeProfit: finalPrice };
          onModifySLTP?.(drag.positionId, mods);
        }
      }

      dragRef.current = null;
      setDragPrice(null);
    };

    container.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onModifySLTP, onModifyPendingOrder]);

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
    <div className="relative" style={{ isolation: "isolate" }}>
      {/* Header */}
      <div className={`${compact ? "mb-1" : "mb-2"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* Symbol + price */}
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
          {/* Timeframe + chart mode controls */}
          <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex rounded bg-white/[0.04] border border-white/[0.06]">
              {(["5m", "30m", "1h"] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
                    timeframe === tf
                      ? "text-emerald-400 bg-emerald-500/15"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
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

      {/* Drag indicator */}
      {dragPrice && (
        <div className="absolute top-2 right-2 z-20">
          <div className={`text-[11px] font-bold px-2 py-1 rounded-lg border backdrop-blur-sm ${
            dragPrice.type === "sl"
              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
              : dragPrice.type === "tp"
              ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
              : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
          }`}>
            {dragPrice.type === "sl" ? "SL" : dragPrice.type === "tp" ? "TP" : "Trigger"}: ${formatPrice(dragPrice.price)}
          </div>
        </div>
      )}

      {/* Active positions overlay removed — shown in cards below chart */}

      {/* Chart container */}
      <div ref={containerRef} className="relative z-0 w-full rounded-lg overflow-hidden" style={{ height, minHeight: height }} />

      {/* Chart overlay toggles — Trades / Positions / AI */}
      <div className="flex items-center gap-1 mt-1.5 mb-2 px-1">
        <div className="flex rounded bg-white/[0.04] border border-white/[0.06]">
          <button
            onClick={() => setShowMarkers(!showMarkers)}
            className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
              showMarkers
                ? "text-emerald-400 bg-emerald-500/15"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Trades
          </button>
          <button
            onClick={() => setShowPositionLines(!showPositionLines)}
            className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
              showPositionLines
                ? "text-emerald-400 bg-emerald-500/15"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            Positions
          </button>
          <button
            onClick={() => setShowPrediction(!showPrediction)}
            className={`px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
              showPrediction
                ? "text-blue-400 bg-blue-500/15"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            AI
          </button>
        </div>
        {prediction && showPrediction && (
          <span className={`text-[9px] font-bold ${prediction.direction === "up" ? "text-emerald-400" : "text-red-400"}`}>
            {prediction.direction === "up" ? "▲" : "▼"} {prediction.confidence.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Injected trade panel (rendered immediately below chart) */}
      {children}

    </div>
  );
};

export default TradingChart;
