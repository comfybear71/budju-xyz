// ============================================================
// MobileAreaChart — Lightweight SVG area chart for iOS/mobile
// Replaces heavyweight lightweight-charts on mobile Safari where
// canvas rendering fails (height collapse, WebGL context issues).
// Uses Binance REST API for historical data + optional WebSocket.
//
// iPhone fix: Uses aspect-ratio CSS + percentage-based sizing
// instead of fixed pixel heights that collapse on iPhone Safari.
// Trade dots: Shows executed trade entry points with strategy info.
// ============================================================

import { useRef, useEffect, useState, useMemo } from "react";
import {
  BinanceKlineStream,
  CODE_TO_BINANCE,
  type KlineBar,
} from "@lib/services/binanceWs";
import type { PerpPosition, PerpTrade, PerpPendingOrder } from "../../types/perps";

interface Props {
  symbol: string;
  baseAsset: string;
  positions?: PerpPosition[];
  trades?: PerpTrade[];
  pendingOrders?: PerpPendingOrder[];
  height?: number;
  compact?: boolean;
}

interface PricePoint {
  time: number;
  price: number;
}

const BINANCE_REST = "https://api.binance.com/api/v3/klines";
const PROXY_REST = "/api/binance";

async function fetchHistoricalPrices(
  binanceSymbol: string,
  limit = 60,
): Promise<PricePoint[]> {
  const symbol = binanceSymbol.toUpperCase();

  // Try our proxy first (avoids iPhone Safari ITP/content blocker issues)
  // then fall back to direct Binance if proxy is unavailable
  const urls = [
    `${PROXY_REST}?symbol=${symbol}&interval=1m&limit=${limit}`,
    `${BINANCE_REST}?symbol=${symbol}&interval=1m&limit=${limit}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status} from ${url.startsWith("/") ? "proxy" : "Binance"}`);
        continue;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        lastError = new Error("Empty response");
        continue;
      }
      return data.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000),
        price: parseFloat(k[4]), // close price
      }));
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError || new Error("All fetch attempts failed");
}

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

const STRATEGY_LABELS: Record<string, string> = {
  trend_following: "Trend",
  scalping: "Scalp",
  mean_reversion: "MeanRev",
  momentum: "Momentum",
  ninja: "Ninja",
  grid: "Grid",
  keltner: "Keltner",
  bb_squeeze: "Squeeze",
  hf_scalper: "HF",
  zone_recovery: "ZoneRec",
  sr_reversal: "S/R Rev",
};

const MobileAreaChart = ({
  symbol,
  baseAsset,
  positions = [],
  trades = [],
  pendingOrders = [],
  height = 200,
  compact = false,
}: Props) => {
  const [data, setData] = useState<PricePoint[]>([]);
  const [livePrice, setLivePrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showTradeDots, setShowTradeDots] = useState(!compact);
  const [showPendingOrders, setShowPendingOrders] = useState(!compact);
  const [tappedTrade, setTappedTrade] = useState<PerpTrade | null>(null);
  const [tappedOrder, setTappedOrder] = useState<PerpPendingOrder | null>(null);
  const streamRef = useRef<BinanceKlineStream | null>(null);
  const dataRef = useRef<PricePoint[]>([]);
  const mountedRef = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const binanceSymbol = CODE_TO_BINANCE[baseAsset] || `${baseAsset.toLowerCase()}usdt`;

  useEffect(() => {
    mountedRef.current = true;
    let stream: BinanceKlineStream | null = null;
    let unsub: (() => void) | null = null;

    const init = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const historical = await fetchHistoricalPrices(binanceSymbol, 60);
        if (!mountedRef.current) return;

        dataRef.current = historical;
        setData(historical);

        if (historical.length > 0) {
          const last = historical[historical.length - 1];
          const first = historical[0];
          setLivePrice(last.price);
          setPriceChange(((last.price - first.price) / first.price) * 100);
        }
        setLoading(false);
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        setFetchError(msg);
        setLoading(false);
        return; // Don't start WebSocket if REST failed
      }

      // Only start WebSocket in focus mode (not compact/grid) to limit connections
      if (compact) return;

      try {
        stream = new BinanceKlineStream(binanceSymbol, "1m");
        streamRef.current = stream;
        stream.connect();

        unsub = stream.onBar((bar: KlineBar) => {
          if (!mountedRef.current) return;
          setConnected(true);
          setLivePrice(bar.close);

          const point: PricePoint = { time: bar.time, price: bar.close };
          const current = [...dataRef.current];

          if (current.length > 0 && current[current.length - 1].time === bar.time) {
            current[current.length - 1] = point;
          } else if (bar.isFinal) {
            current.push(point);
            if (current.length > 60) current.shift();
          } else if (current.length > 0) {
            current[current.length - 1] = point;
          }

          dataRef.current = current;
          setData([...current]);

          if (current.length > 0) {
            setPriceChange(((bar.close - current[0].price) / current[0].price) * 100);
          }
        });
      } catch {
        // WebSocket failed, chart still shows REST data — that's fine
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      unsub?.();
      if (stream) {
        stream.disconnect();
      }
      streamRef.current = null;
    };
  }, [binanceSymbol, compact]);

  // Build SVG path
  const svgWidth = 400;
  const svgHeight = Math.max(height - (compact ? 24 : 40), 40);
  const padding = { top: 8, right: 4, bottom: 4, left: 4 };
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  let pathD = "";
  let areaD = "";
  let gradientColor = "#3b82f6";
  let minPrice = 0;
  let maxPrice = 0;
  let priceRange = 1;

  if (data.length >= 2) {
    const prices = data.map((d) => d.price);
    minPrice = Math.min(...prices);
    maxPrice = Math.max(...prices);
    priceRange = maxPrice - minPrice || 1;

    const isUp = prices[prices.length - 1] >= prices[0];
    gradientColor = isUp ? "#22c55e" : "#ef4444";

    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = padding.top + (1 - (d.price - minPrice) / priceRange) * chartHeight;
      return { x, y };
    });

    pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${svgHeight} L ${points[0].x.toFixed(1)} ${svgHeight} Z`;
  }

  // Filter trades that fall within the chart's time & price range for this symbol
  const chartTrades = useMemo(() => {
    if (!showTradeDots || data.length < 2) return [];
    const timeMin = data[0].time;
    const timeMax = data[data.length - 1].time;

    return trades
      .filter((t) => {
        if (t.symbol !== symbol) return false;
        if (!t.entry_time) return false;
        const entryTime = Math.floor(new Date(t.entry_time).getTime() / 1000);
        return entryTime >= timeMin && entryTime <= timeMax;
      })
      .map((t) => {
        const entryTime = Math.floor(new Date(t.entry_time).getTime() / 1000);
        // Map time to x coordinate
        const timeRange = data[data.length - 1].time - data[0].time || 1;
        const x = padding.left + ((entryTime - data[0].time) / timeRange) * chartWidth;
        // Map price to y coordinate
        const y = padding.top + (1 - (t.entry_price - minPrice) / priceRange) * chartHeight;
        return { trade: t, x, y };
      })
      .filter((t) => t.x >= padding.left && t.x <= svgWidth - padding.right);
  }, [trades, data, showTradeDots, symbol, minPrice, priceRange, chartWidth, svgWidth, padding.left, padding.right, padding.top]);

  // Filter pending orders for this symbol that are within the visible price range
  const chartPendingOrders = useMemo(() => {
    if (!showPendingOrders || data.length < 2) return [];
    return pendingOrders
      .filter((o) => o.symbol === symbol && o.status === "pending")
      .map((o) => {
        const price = o.trigger_price;
        // Extend min/max slightly so pending orders outside the current range still show
        const extMin = minPrice - priceRange * 0.1;
        const extMax = maxPrice + priceRange * 0.1;
        if (price < extMin || price > extMax) return null;
        const y = padding.top + (1 - (price - minPrice) / priceRange) * chartHeight;
        return { order: o, y };
      })
      .filter(Boolean) as { order: PerpPendingOrder; y: number }[];
  }, [pendingOrders, data, showPendingOrders, symbol, minPrice, maxPrice, priceRange, padding.top, chartHeight]);

  const isPositive = priceChange >= 0;
  const myPositions = positions.filter((p) => p.symbol === symbol && p.status === "open");
  const hasTradesForSymbol = trades.some((t) => t.symbol === symbol);
  const hasPendingForSymbol = pendingOrders.some((o) => o.symbol === symbol && o.status === "pending");

  // iPhone Safari fix: use aspect-ratio instead of fixed height
  // iPhone collapses elements with only style={{ height }} when
  // the SVG uses viewBox + preserveAspectRatio="none"
  const aspectRatio = svgWidth / svgHeight;

  return (
    <div className="relative" ref={containerRef} style={{ minHeight: compact ? 80 : 120 }}>
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
          {/* Chart overlay toggles */}
          {!compact && (hasTradesForSymbol || hasPendingForSymbol) && (
            <div className="flex items-center gap-1">
              {hasTradesForSymbol && (
                <button
                  onClick={() => {
                    setShowTradeDots(!showTradeDots);
                    setTappedTrade(null);
                  }}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    showTradeDots
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                      : "bg-white/[0.04] text-slate-500 border-white/[0.06]"
                  }`}
                >
                  {showTradeDots ? "● Trades" : "○ Trades"}
                </button>
              )}
              {hasPendingForSymbol && (
                <button
                  onClick={() => {
                    setShowPendingOrders(!showPendingOrders);
                    setTappedOrder(null);
                  }}
                  className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    showPendingOrders
                      ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/25"
                      : "bg-white/[0.04] text-slate-500 border-white/[0.06]"
                  }`}
                >
                  {showPendingOrders ? "◆ Orders" : "◇ Orders"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="flex items-center justify-center bg-slate-900/50 rounded-lg"
          style={{ aspectRatio, width: "100%", maxHeight: svgHeight }}
        >
          <div className="text-xs text-slate-400 animate-pulse">Loading {baseAsset}...</div>
        </div>
      )}

      {/* Error state */}
      {!loading && fetchError && (
        <div
          className="flex flex-col items-center justify-center bg-slate-900/50 rounded-lg gap-1"
          style={{ aspectRatio, width: "100%", maxHeight: svgHeight }}
        >
          <div className="text-xs text-red-400">Chart failed to load</div>
          <div className="text-[9px] text-slate-600 max-w-[90%] text-center break-words">{fetchError}</div>
          <button
            onClick={() => {
              setFetchError(null);
              setLoading(true);
              fetchHistoricalPrices(binanceSymbol, 60)
                .then((historical) => {
                  if (!mountedRef.current) return;
                  dataRef.current = historical;
                  setData(historical);
                  if (historical.length > 0) {
                    setLivePrice(historical[historical.length - 1].price);
                    setPriceChange(((historical[historical.length - 1].price - historical[0].price) / historical[0].price) * 100);
                  }
                  setLoading(false);
                })
                .catch((e) => {
                  if (!mountedRef.current) return;
                  setFetchError(e instanceof Error ? e.message : String(e));
                  setLoading(false);
                });
            }}
            className="text-[9px] text-blue-400 hover:text-blue-300 underline mt-0.5"
          >
            Retry
          </button>
        </div>
      )}

      {/* SVG Area Chart */}
      {!loading && !fetchError && data.length >= 2 && (
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full rounded-lg"
          style={{
            aspectRatio,
            maxHeight: svgHeight,
            display: "block",
          }}
          preserveAspectRatio="xMidYMid meet"
          onClick={() => { setTappedTrade(null); setTappedOrder(null); }}
        >
          <defs>
            <linearGradient id={`grad-${baseAsset}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gradientColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={gradientColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#grad-${baseAsset})`} />

          {/* Line */}
          <path d={pathD} fill="none" stroke={gradientColor} strokeWidth="1.5" />

          {/* Position entry lines */}
          {myPositions.map((pos) => {
            if (pos.entry_price < minPrice || pos.entry_price > maxPrice) return null;
            const y = padding.top + (1 - (pos.entry_price - minPrice) / priceRange) * chartHeight;

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

          {/* Pending order lines */}
          {chartPendingOrders.map(({ order, y }, i) => {
            const isLimit = order.order_type === "limit";
            const isLong = order.direction === "long";
            const lineColor = isLimit ? "#06b6d4" : "#f59e0b"; // cyan for limit, amber for stop
            const isTapped = tappedOrder?._id === order._id;
            const labelText = `${isLimit ? "LMT" : "STP"} ${isLong ? "BUY" : "SELL"} $${formatPrice(order.trigger_price)}`;

            return (
              <g key={order._id || `po-${i}`}>
                {/* Dashed price line */}
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke={lineColor}
                  strokeWidth={isTapped ? 1.2 : 0.7}
                  strokeDasharray={isLimit ? "6 3" : "3 3 1 3"}
                  opacity={isTapped ? 0.9 : 0.5}
                />
                {/* Diamond marker on the right */}
                <polygon
                  points={`${svgWidth - padding.right - 12},${y} ${svgWidth - padding.right - 8},${y - 4} ${svgWidth - padding.right - 4},${y} ${svgWidth - padding.right - 8},${y + 4}`}
                  fill={lineColor}
                  opacity={0.8}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTappedOrder(isTapped ? null : order);
                    setTappedTrade(null);
                  }}
                />
                {/* Price label background */}
                <rect
                  x={padding.left + 2}
                  y={y - 6}
                  width={labelText.length * 4.2 + 6}
                  height={12}
                  rx={2}
                  fill="#0f172a"
                  fillOpacity={0.85}
                  stroke={lineColor}
                  strokeWidth={0.5}
                  strokeOpacity={0.4}
                />
                {/* Price label text */}
                <text
                  x={padding.left + 5}
                  y={y + 3}
                  fill={lineColor}
                  fontSize="7"
                  fontFamily="monospace"
                  opacity={0.9}
                >
                  {labelText}
                </text>
              </g>
            );
          })}

          {/* Trade execution dots */}
          {chartTrades.map(({ trade, x, y }, i) => {
            const isLong = trade.direction === "long";
            const isWin = trade.realized_pnl > 0;
            const isTapped = tappedTrade?._id === trade._id;
            const dotColor = isLong ? "#22c55e" : "#ef4444";
            const ringColor = isWin ? "#fbbf24" : "#64748b";

            return (
              <g key={trade._id || i}>
                {/* Outer ring (win/loss indicator) */}
                <circle
                  cx={x}
                  cy={y}
                  r={isTapped ? 6 : 4}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="1"
                  opacity={isTapped ? 1 : 0.7}
                />
                {/* Inner dot (direction) */}
                <circle
                  cx={x}
                  cy={y}
                  r={isTapped ? 3.5 : 2.5}
                  fill={dotColor}
                  opacity={0.9}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setTappedTrade(isTapped ? null : trade);
                    setTappedOrder(null);
                  }}
                />
                {/* Direction arrow */}
                <text
                  x={x}
                  y={isLong ? y - (isTapped ? 9 : 7) : y + (isTapped ? 12 : 10)}
                  textAnchor="middle"
                  fill={dotColor}
                  fontSize={isTapped ? "8" : "6"}
                  opacity="0.8"
                >
                  {isLong ? "▲" : "▼"}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {/* No data state */}
      {!loading && !fetchError && data.length < 2 && (
        <div
          className="flex items-center justify-center bg-slate-900/50 rounded-lg"
          style={{ aspectRatio, width: "100%", maxHeight: svgHeight }}
        >
          <div className="text-xs text-slate-500">No price data</div>
        </div>
      )}

      {/* Tapped trade info popup */}
      {tappedTrade && (
        <div
          className="absolute z-20 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-white/10 px-2.5 py-2 shadow-xl"
          style={{ bottom: 8, left: 8, right: 8 }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold ${tappedTrade.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                {tappedTrade.direction.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-400">
                {STRATEGY_LABELS[tappedTrade.strategy] || tappedTrade.strategy}
              </span>
              <span className="text-[10px] text-slate-500">
                {tappedTrade.leverage}x
              </span>
            </div>
            <button
              onClick={() => setTappedTrade(null)}
              className="text-slate-500 hover:text-white text-[10px] px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-slate-500">
              Entry: <span className="text-slate-300">${formatPrice(tappedTrade.entry_price)}</span>
            </span>
            {tappedTrade.exit_price > 0 && (
              <span className="text-slate-500">
                Exit: <span className="text-slate-300">${formatPrice(tappedTrade.exit_price)}</span>
              </span>
            )}
            <span className={`font-bold ${tappedTrade.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {tappedTrade.realized_pnl >= 0 ? "+" : ""}${tappedTrade.realized_pnl.toFixed(2)}
            </span>
            {tappedTrade.exit_type && (
              <span className="text-slate-600 capitalize">{tappedTrade.exit_type.replace("_", " ")}</span>
            )}
          </div>
          {tappedTrade.entry_time && (
            <div className="text-[8px] text-slate-600 mt-0.5">
              {new Date(tappedTrade.entry_time).toLocaleString()}
            </div>
          )}
        </div>
      )}

      {/* Tapped pending order info popup */}
      {tappedOrder && (
        <div
          className="absolute z-20 bg-slate-800/95 backdrop-blur-sm rounded-lg border border-cyan-500/20 px-2.5 py-2 shadow-xl"
          style={{ bottom: 8, left: 8, right: 8 }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold ${tappedOrder.order_type === "limit" ? "text-cyan-400" : "text-amber-400"}`}>
                {tappedOrder.order_type === "limit" ? "LIMIT" : "STOP"} ORDER
              </span>
              <span className={`text-[10px] font-bold ${tappedOrder.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                {tappedOrder.direction === "long" ? "BUY" : "SELL"}
              </span>
              <span className="text-[10px] text-slate-500">
                {tappedOrder.leverage}x
              </span>
            </div>
            <button
              onClick={() => setTappedOrder(null)}
              className="text-slate-500 hover:text-white text-[10px] px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-3 text-[9px]">
            <span className="text-slate-500">
              Trigger: <span className="text-slate-300">${formatPrice(tappedOrder.trigger_price)}</span>
            </span>
            <span className="text-slate-500">
              Size: <span className="text-slate-300">${tappedOrder.size_usd.toFixed(0)}</span>
            </span>
            {tappedOrder.stop_loss && (
              <span className="text-red-400/70">
                SL: ${formatPrice(tappedOrder.stop_loss)}
              </span>
            )}
            {tappedOrder.take_profit && (
              <span className="text-emerald-400/70">
                TP: ${formatPrice(tappedOrder.take_profit)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[8px] text-slate-600 mt-0.5">
            {tappedOrder.entry_reason && <span>{tappedOrder.entry_reason}</span>}
            {tappedOrder.expires_at && (
              <span>Expires: {new Date(tappedOrder.expires_at).toLocaleString()}</span>
            )}
          </div>
        </div>
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
