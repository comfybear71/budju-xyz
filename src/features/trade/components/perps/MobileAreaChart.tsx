// ============================================================
// MobileAreaChart — Lightweight SVG area chart for iOS/mobile
// Replaces heavyweight lightweight-charts on mobile Safari where
// canvas rendering fails (height collapse, WebGL context issues).
// Uses pure SVG with Binance WebSocket data.
// ============================================================

import { useRef, useEffect, useState, useCallback } from "react";
import {
  BinanceKlineStream,
  CODE_TO_BINANCE,
  type KlineBar,
} from "@lib/services/binanceWs";
import type { PerpPosition } from "../../types/perps";

interface Props {
  symbol: string;
  baseAsset: string;
  positions?: PerpPosition[];
  height?: number;
  compact?: boolean;
}

interface PricePoint {
  time: number;
  price: number;
}

const BINANCE_REST = "https://api.binance.com/api/v3/klines";

async function fetchHistoricalPrices(
  binanceSymbol: string,
  limit = 120,
): Promise<PricePoint[]> {
  const symbol = binanceSymbol.toUpperCase();
  const url = `${BINANCE_REST}?symbol=${symbol}&interval=1m&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((k: any[]) => ({
      time: Math.floor(k[0] / 1000),
      price: parseFloat(k[4]), // close price
    }));
  } catch {
    return [];
  }
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

const MobileAreaChart = ({
  symbol,
  baseAsset,
  positions = [],
  height = 200,
  compact = false,
}: Props) => {
  const [data, setData] = useState<PricePoint[]>([]);
  const [livePrice, setLivePrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const streamRef = useRef<BinanceKlineStream | null>(null);
  const dataRef = useRef<PricePoint[]>([]);

  const binanceSymbol = CODE_TO_BINANCE[baseAsset] || `${baseAsset.toLowerCase()}usdt`;

  useEffect(() => {
    let wsCleanup: (() => void) | null = null;

    (async () => {
      setLoading(true);
      const historical = await fetchHistoricalPrices(binanceSymbol, 120);
      dataRef.current = historical;
      setData(historical);

      if (historical.length > 0) {
        const last = historical[historical.length - 1];
        const first = historical[0];
        setLivePrice(last.price);
        setPriceChange(((last.price - first.price) / first.price) * 100);
      }

      setLoading(false);

      // Start WebSocket
      const stream = new BinanceKlineStream(binanceSymbol, "1m");
      streamRef.current = stream;
      stream.connect();

      const unsub = stream.onBar((bar: KlineBar) => {
        setConnected(true);
        setLivePrice(bar.close);

        const point: PricePoint = { time: bar.time, price: bar.close };

        // Update last point or append
        const current = [...dataRef.current];
        if (current.length > 0 && current[current.length - 1].time === bar.time) {
          current[current.length - 1] = point;
        } else if (bar.isFinal) {
          current.push(point);
          // Keep last 120 points
          if (current.length > 120) current.shift();
        } else {
          // Update in-progress candle
          if (current.length > 0) {
            current[current.length - 1] = point;
          }
        }

        dataRef.current = current;
        setData([...current]);

        if (current.length > 0) {
          const first = current[0];
          setPriceChange(((bar.close - first.price) / first.price) * 100);
        }
      });

      wsCleanup = () => {
        unsub();
        stream.disconnect();
      };
    })();

    return () => {
      wsCleanup?.();
      if (streamRef.current) {
        streamRef.current.disconnect();
        streamRef.current = null;
      }
    };
  }, [binanceSymbol]);

  // Build SVG path
  const svgWidth = 400;
  const svgHeight = height - (compact ? 24 : 40);
  const padding = { top: 8, right: 4, bottom: 4, left: 4 };

  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  let pathD = "";
  let areaD = "";
  let gradientColor = "#3b82f6";

  if (data.length >= 2) {
    const prices = data.map((d) => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;

    // Determine color based on trend
    const isUp = prices[prices.length - 1] >= prices[0];
    gradientColor = isUp ? "#22c55e" : "#ef4444";

    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + (1 - (d.price - minPrice) / range) * chartHeight;
      return { x, y };
    });

    pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${svgHeight} L ${points[0].x.toFixed(1)} ${svgHeight} Z`;

    // Draw position lines
  }

  const isPositive = priceChange >= 0;
  const myPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");

  return (
    <div className="relative">
      {/* Header */}
      <div className={`${compact ? "mb-0.5" : "mb-1"}`}>
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
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex items-center justify-center bg-slate-900/50 rounded-lg"
          style={{ height: svgHeight }}
        >
          <div className="text-xs text-slate-400 animate-pulse">Loading {baseAsset}...</div>
        </div>
      )}

      {/* SVG Area Chart */}
      {!loading && data.length >= 2 && (
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full rounded-lg"
          style={{ height: svgHeight }}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={gradientColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#grad-${symbol})`} />

          {/* Line */}
          <path d={pathD} fill="none" stroke={gradientColor} strokeWidth="1.5" />

          {/* Position entry lines */}
          {myPositions.map((pos) => {
            const prices = data.map((d) => d.price);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);
            const range = maxPrice - minPrice || 1;

            if (pos.entry_price < minPrice || pos.entry_price > maxPrice) return null;
            const y = padding.top + (1 - (pos.entry_price - minPrice) / range) * chartHeight;

            return (
              <line
                key={pos._id}
                x1={padding.left}
                y1={y}
                x2={svgWidth - padding.right}
                y2={y}
                stroke={pos.direction === "long" ? "#22c55e" : "#ef4444"}
                strokeWidth="0.8"
                strokeDasharray="4 3"
                opacity="0.6"
              />
            );
          })}
        </svg>
      )}

      {/* Position badges */}
      {myPositions.length > 0 && !compact && (
        <div className="absolute top-7 left-1 z-10 space-y-0.5">
          {myPositions.map((pos) => (
            <div
              key={pos._id}
              className={`text-[9px] px-1.5 py-0.5 rounded border backdrop-blur-sm ${
                pos.direction === "long"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              {pos.direction.toUpperCase()} {pos.leverage}x{" "}
              <span className={pos.unrealized_pnl >= 0 ? "text-emerald-300" : "text-red-300"}>
                {pos.unrealized_pnl >= 0 ? "+" : ""}${pos.unrealized_pnl.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MobileAreaChart;
