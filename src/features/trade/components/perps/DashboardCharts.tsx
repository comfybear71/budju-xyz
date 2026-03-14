// ============================================================
// DashboardCharts — Multi-symbol real-time trading dashboard
// Grid/tab layout of TradingChart components for all perp markets.
// Includes:
//   - Symbol selector tabs with live prices
//   - Grid view (2x3) and focus view (single chart)
//   - Trade stats sidebar (win rate, P&L, active positions)
//   - Win/loss heatmap by hour-of-day
// ============================================================

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import TradingChart from "./TradingChart";
import { useLivePrices } from "@hooks/useLivePrices";
import type { PerpPosition, PerpTrade, PerpMetrics } from "../../types/perps";

// ── Types ────────────────────────────────────────────────────

interface Props {
  positions: PerpPosition[];
  trades: PerpTrade[];
  metrics?: PerpMetrics | null;
  wallet?: string;
  onClose: () => void;
}

interface MarketDef {
  symbol: string; // e.g. "SOL-PERP"
  base: string; // e.g. "SOL"
  label: string;
}

// ── Constants ────────────────────────────────────────────────

const MARKETS: MarketDef[] = [
  { symbol: "SOL-PERP", base: "SOL", label: "SOL" },
  { symbol: "BTC-PERP", base: "BTC", label: "BTC" },
  { symbol: "ETH-PERP", base: "ETH", label: "ETH" },
  { symbol: "LINK-PERP", base: "LINK", label: "LINK" },
  { symbol: "SUI-PERP", base: "SUI", label: "SUI" },
  { symbol: "AVAX-PERP", base: "AVAX", label: "AVAX" },
];

// ── Helpers ──────────────────────────────────────────────────

function getHourlyWinRate(trades: PerpTrade[]): Record<number, { wins: number; total: number }> {
  const hours: Record<number, { wins: number; total: number }> = {};
  for (let h = 0; h < 24; h++) hours[h] = { wins: 0, total: 0 };

  for (const t of trades) {
    if (!t.entry_time) continue;
    const hour = new Date(t.entry_time).getUTCHours();
    hours[hour].total++;
    if (t.realized_pnl > 0) hours[hour].wins++;
  }
  return hours;
}

// ── Lazy Chart Wrapper ────────────────────────────────────────
// Uses IntersectionObserver to only mount TradingChart (and its WebSocket)
// when the container scrolls into view. This prevents iOS Safari from
// hitting the ~6 concurrent WebSocket limit when all 6 grid charts
// try to connect simultaneously.

const LazyChart = ({
  symbol,
  base,
  positions,
  trades,
  height,
  compact,
}: {
  symbol: string;
  base: string;
  positions: PerpPosition[];
  trades: PerpTrade[];
  height: number;
  compact: boolean;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // On browsers without IntersectionObserver (rare), just render immediately
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Only need to trigger once
        }
      },
      { rootMargin: "100px" }, // Start loading slightly before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref}>
      {isVisible ? (
        <TradingChart
          symbol={symbol}
          baseAsset={base}
          positions={positions}
          trades={trades}
          height={height}
          compact={compact}
        />
      ) : (
        <div
          style={{ height: `${height}px` }}
          className="flex items-center justify-center text-xs text-slate-600 animate-pulse"
        >
          Loading {base} chart...
        </div>
      )}
    </div>
  );
};

// Detect mobile/small screen for limiting concurrent charts
function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Component ────────────────────────────────────────────────

const DashboardCharts = ({ positions, trades, metrics, onClose }: Props) => {
  const [viewMode, setViewMode] = useState<"grid" | "focus">("grid");
  const [focusedSymbol, setFocusedSymbol] = useState<string>("SOL-PERP");
  const { prices: wsPrices, wsState } = useLivePrices(500);

  // Compute stats
  const openPositions = positions.filter((p) => p.status === "open");
  const totalPnl = openPositions.reduce((s, p) => s + p.unrealized_pnl, 0);
  const hourlyStats = useMemo(() => getHourlyWinRate(trades), [trades]);

  // Per-market position count
  const positionsBySymbol = useMemo(() => {
    const map: Record<string, PerpPosition[]> = {};
    for (const p of positions) {
      if (!map[p.symbol]) map[p.symbol] = [];
      map[p.symbol].push(p);
    }
    return map;
  }, [positions]);

  // Track price direction for red/green card borders
  const prevPricesRef = useRef<Record<string, number>>({});
  const [priceDirection, setPriceDirection] = useState<Record<string, "up" | "down" | null>>({});

  useEffect(() => {
    const prev = prevPricesRef.current;
    const dirs: Record<string, "up" | "down" | null> = {};

    for (const m of MARKETS) {
      const oldPrice = prev[m.base];
      const newPrice = wsPrices[m.base];
      if (oldPrice !== undefined && newPrice !== undefined && oldPrice !== newPrice) {
        dirs[m.base] = newPrice > oldPrice ? "up" : "down";
      } else {
        dirs[m.base] = null;
      }
    }

    setPriceDirection(dirs);
    // Snapshot current prices
    const snapshot: Record<string, number> = {};
    for (const m of MARKETS) {
      if (wsPrices[m.base]) snapshot[m.base] = wsPrices[m.base];
    }
    prevPricesRef.current = snapshot;

    // Clear direction after 3 seconds
    const timer = setTimeout(() => setPriceDirection({}), 3000);
    return () => clearTimeout(timer);
  }, [wsPrices]);

  const getCardBorder = useCallback((base: string) => {
    const dir = priceDirection[base];
    if (dir === "up") return "border-green-500/60 shadow-[0_0_12px_rgba(34,197,94,0.15)]";
    if (dir === "down") return "border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.15)]";
    return "border-white/[0.04]";
  }, [priceDirection]);

  const isMobile = useIsMobile();
  const focusMarket = MARKETS.find((m) => m.symbol === focusedSymbol) || MARKETS[0];

  // On mobile, limit grid to 4 charts to stay within iOS Safari's
  // WebSocket connection limit (~6 total, minus the shared price stream).
  const gridMarkets = isMobile ? MARKETS.slice(0, 4) : MARKETS;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">Live Charts</span>
          {wsState.connected && (
            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono border border-emerald-500/20 animate-pulse">
              {wsState.priceCount} FEEDS
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* View mode toggle */}
          <div className="flex rounded bg-white/[0.04] border border-white/[0.06]">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2 py-1 text-[9px] font-bold transition-colors ${
                viewMode === "grid"
                  ? "text-blue-400 bg-blue-500/15"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("focus")}
              className={`px-2 py-1 text-[9px] font-bold transition-colors ${
                viewMode === "focus"
                  ? "text-blue-400 bg-blue-500/15"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Focus
            </button>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-sm px-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <div className="flex-shrink-0 bg-slate-800/40 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase">Open</div>
          <div className="text-xs font-bold text-white">{openPositions.length}</div>
        </div>
        <div className="flex-shrink-0 bg-slate-800/40 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
          <div className="text-[9px] text-slate-500 uppercase">Unreal. P&L</div>
          <div className={`text-xs font-bold ${totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
          </div>
        </div>
        {metrics && (
          <>
            <div className="flex-shrink-0 bg-slate-800/40 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
              <div className="text-[9px] text-slate-500 uppercase">Win Rate</div>
              <div className={`text-xs font-bold ${metrics.win_rate >= 50 ? "text-emerald-400" : "text-amber-400"}`}>
                {metrics.win_rate.toFixed(1)}%
              </div>
            </div>
            <div className="flex-shrink-0 bg-slate-800/40 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
              <div className="text-[9px] text-slate-500 uppercase">Total P&L</div>
              <div className={`text-xs font-bold ${metrics.total_pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {metrics.total_pnl >= 0 ? "+" : ""}${metrics.total_pnl.toFixed(2)}
              </div>
            </div>
            <div className="flex-shrink-0 bg-slate-800/40 rounded-lg px-2.5 py-1.5 border border-white/[0.04]">
              <div className="text-[9px] text-slate-500 uppercase">Sharpe</div>
              <div className="text-xs font-bold text-white">{metrics.sharpe_ratio.toFixed(2)}</div>
            </div>
          </>
        )}
      </div>

      {/* Symbol tabs (focus mode) / Grid charts */}
      {viewMode === "focus" ? (
        <>
          {/* Symbol selector */}
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {MARKETS.map((m) => {
              const pos = positionsBySymbol[m.symbol] || [];
              const hasPosition = pos.some((p) => p.status === "open");
              const wsPrice = wsPrices[m.base];
              return (
                <button
                  key={m.symbol}
                  onClick={() => setFocusedSymbol(m.symbol)}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                    focusedSymbol === m.symbol
                      ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                      : hasPosition
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "text-slate-400 border-transparent hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  <span>{m.label}</span>
                  {wsPrice && (
                    <span className="ml-1 text-slate-500 font-mono">
                      ${wsPrice >= 1000 ? wsPrice.toFixed(0) : wsPrice >= 1 ? wsPrice.toFixed(2) : wsPrice.toFixed(4)}
                    </span>
                  )}
                  {hasPosition && <span className="ml-1 text-emerald-400">*</span>}
                </button>
              );
            })}
          </div>

          {/* Single focused chart */}
          <div className={`bg-slate-800/30 rounded-xl border p-3 transition-all duration-300 ${getCardBorder(focusMarket.base)}`}>
            <TradingChart
              symbol={focusMarket.symbol}
              baseAsset={focusMarket.base}
              positions={positions}
              trades={trades}
              height={350}
            />
          </div>
        </>
      ) : (
        /* Grid view — 2 columns on desktop, 1 on mobile.
           Uses LazyChart to defer WebSocket connections until visible,
           preventing iOS Safari from exceeding its connection limit. */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {gridMarkets.map((m) => (
            <div
              key={m.symbol}
              className={`bg-slate-800/30 rounded-xl border p-2 cursor-pointer hover:border-blue-500/20 transition-all duration-300 ${getCardBorder(m.base)}`}
              onClick={() => {
                setFocusedSymbol(m.symbol);
                setViewMode("focus");
              }}
            >
              <LazyChart
                symbol={m.symbol}
                base={m.base}
                positions={positions}
                trades={trades}
                height={180}
                compact
              />
            </div>
          ))}
        </div>
      )}

      {/* Hourly win/loss heatmap */}
      {trades.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-white/[0.04] p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">
            Win Rate by Hour (UTC)
          </div>
          <div className="flex gap-[2px]">
            {Array.from({ length: 24 }, (_, h) => {
              const stats = hourlyStats[h];
              const rate = stats.total > 0 ? stats.wins / stats.total : 0.5;
              const hasData = stats.total > 0;
              // Green for high win rate, red for low, gray for no data
              const bg = !hasData
                ? "bg-white/[0.03]"
                : rate >= 0.7
                  ? "bg-emerald-500/40"
                  : rate >= 0.5
                    ? "bg-emerald-500/20"
                    : rate >= 0.3
                      ? "bg-amber-500/20"
                      : "bg-red-500/30";
              return (
                <div
                  key={h}
                  className={`flex-1 rounded-sm ${bg} group relative`}
                  style={{ height: 20 }}
                  title={`${h}:00 UTC — ${stats.wins}W/${stats.total - stats.wins}L (${stats.total > 0 ? (rate * 100).toFixed(0) : "—"}%)`}
                >
                  {h % 6 === 0 && (
                    <span className="absolute -bottom-3 left-0 text-[7px] text-slate-600">
                      {h}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[8px] text-slate-600 mt-4">
            <span>Red = low win rate</span>
            <span>Green = high win rate</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardCharts;
