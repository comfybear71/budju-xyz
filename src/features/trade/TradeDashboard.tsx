import { useState, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router";
import { APP_NAME } from "@constants/config";
import { useEffect } from "react";
import { useDashboardData } from "./hooks/useDashboardData";
import BotControlBar from "./components/dashboard/BotControlBar";
import MarketPills from "./components/dashboard/MarketPills";
import SignalFeed from "./components/dashboard/SignalFeed";
import QuickTradeSheet from "./components/dashboard/QuickTradeSheet";
import PositionsStrip from "./components/dashboard/PositionsStrip";
import type { StrategyOpportunity } from "./utils/strategyDetectors";

// Lazy load heavy components
const TradingChart = lazy(() => import("./components/perps/TradingChart"));
const PerpOrderForm = lazy(() => import("./components/perps/PerpOrderForm"));
const PerpStrategyPanel = lazy(() => import("./components/perps/PerpStrategyPanel"));
const PerpEquityChart = lazy(() => import("./components/perps/PerpEquityChart"));
const PerpMetricsPanel = lazy(() => import("./components/perps/PerpMetricsPanel"));
const PerpTradeHistory = lazy(() => import("./components/perps/PerpTradeHistory"));
const AIAnalysisPanel = lazy(() => import("./components/perps/AIAnalysisPanel"));
const PerpPendingOrders = lazy(() => import("./components/perps/PerpPendingOrders"));

type BottomPanel = "signals" | "positions" | "order" | "strategy" | "equity" | "metrics" | "history" | "ai" | "pending";

const ChartLoader = () => (
  <div className="flex items-center justify-center h-full bg-slate-900/50 rounded-xl">
    <div className="text-[11px] text-slate-400 animate-pulse">Loading chart...</div>
  </div>
);

const TradeDashboard = () => {
  const data = useDashboardData();
  const navigate = useNavigate();

  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [tradeSheetPrefill, setTradeSheetPrefill] = useState<StrategyOpportunity | null>(null);
  const [activePanel, setActivePanel] = useState<BottomPanel>("signals");

  // Page title
  useEffect(() => {
    document.title = `Dashboard - ${APP_NAME}`;
    window.scrollTo(0, 0);
  }, []);

  // Handle signal trade click — open quick trade sheet
  const handleSignalTrade = useCallback((opp: StrategyOpportunity) => {
    setTradeSheetPrefill(opp);
    setTradeSheetOpen(true);
    data.setSelectedSymbol(opp.market);
  }, [data]);

  // Handle chart symbol change from positions
  const handleViewChart = useCallback((symbol: string) => {
    data.setSelectedSymbol(symbol);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [data]);

  // Loading state
  if (data.loading && !data.account && !data.positions.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-slate-400 animate-pulse">Loading trading dashboard...</div>
      </div>
    );
  }

  const panelTabs: { key: BottomPanel; label: string; badge?: number }[] = [
    { key: "signals", label: "Signals" },
    { key: "positions", label: "Positions", badge: data.positions.length || undefined },
    { key: "order", label: "Order" },
    { key: "strategy", label: "Bot" },
    { key: "pending", label: "Pending" },
    { key: "equity", label: "Equity" },
    { key: "metrics", label: "Stats" },
    { key: "history", label: "History" },
    { key: "ai", label: "AI" },
  ];

  return (
    <div className="min-h-screen bg-[#060b18]">
      {/* Sticky control bar */}
      <BotControlBar data={data} />

      {/* Market pills */}
      <MarketPills
        markets={data.markets}
        prices={data.prices}
        selectedSymbol={data.selectedSymbol}
        onSelect={data.setSelectedSymbol}
        positions={data.positions}
      />

      {/* Error banner */}
      {data.error && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-400 flex items-center justify-between">
          <span>{data.error}</span>
          <button onClick={data.clearError} className="text-slate-500 hover:text-white ml-2">✕</button>
        </div>
      )}

      {/* Account summary — compact row */}
      {data.account && (
        <div className="grid grid-cols-4 gap-1.5 px-3 mb-2">
          {[
            { label: "Balance", value: `$${data.account.balance.toFixed(0)}` },
            { label: "Equity", value: `$${data.account.equity.toFixed(0)}`, color: data.account.equity >= 10000 ? "text-emerald-400" : "text-red-400" },
            { label: "Realized", value: `${data.account.realized_pnl >= 0 ? "+" : ""}$${data.account.realized_pnl.toFixed(0)}`, color: data.account.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Win Rate", value: data.account.metrics.total_trades > 0 ? `${data.account.metrics.win_rate.toFixed(0)}%` : "—" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/30 rounded-lg px-2 py-1.5 border border-white/[0.03]">
              <div className="text-[8px] text-slate-600 uppercase">{s.label}</div>
              <div className={`text-[11px] font-bold ${s.color || "text-white"}`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* === MAIN CONTENT === */}
      {/* Mobile: stacked | Desktop: 3-column grid */}
      <div className="lg:grid lg:grid-cols-[1fr_2fr_1fr] lg:gap-0 lg:h-[calc(100vh-180px)]">

        {/* LEFT: Markets sidebar (desktop only) — we already have pills on mobile */}
        <div className="hidden lg:block border-r border-white/[0.04] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {/* Desktop market list */}
          <div className="p-2 space-y-0.5">
            {data.markets.map((m) => {
              const price = data.prices[m.symbol] || 0;
              const isSelected = m.symbol === data.selectedSymbol;
              const posCount = data.positions.filter((p) => p.symbol === m.symbol).length;

              return (
                <button
                  key={m.symbol}
                  onClick={() => data.setSelectedSymbol(m.symbol)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] transition-all ${
                    isSelected
                      ? "bg-blue-500/15 text-white border border-blue-500/30"
                      : "text-slate-400 hover:bg-slate-800/40 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{m.base_asset}</span>
                    {posCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[8px] flex items-center justify-center">
                        {posCount}
                      </span>
                    )}
                  </div>
                  <span className="tabular-nums text-slate-500">
                    {price >= 1000
                      ? `$${(price / 1000).toFixed(1)}k`
                      : price >= 1
                        ? `$${price.toFixed(2)}`
                        : price > 0
                          ? `$${price.toFixed(4)}`
                          : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Desktop positions below market list */}
          <div className="border-t border-white/[0.04]">
            <PositionsStrip
              positions={data.positions}
              prices={data.prices}
              wallet={data.wallet}
              onClose={data.handleClosePosition}
              onModify={data.handleModifyPosition}
              onViewChart={handleViewChart}
              onRefresh={data.refreshData}
            />
          </div>
        </div>

        {/* CENTER: Chart */}
        <div className="px-3 lg:px-0">
          <div className="h-[50vh] lg:h-full">
            <Suspense fallback={<ChartLoader />}>
              <TradingChart
                symbol={data.selectedSymbol}
                baseAsset={data.selectedBaseAsset}
                positions={data.positions.filter((p) => p.symbol === data.selectedSymbol)}
                trades={data.trades.filter((t) => t.symbol === data.selectedSymbol)}
                height={undefined}
                strategyStatus={data.strategyStatus}
                onModifySLTP={(positionId, mods) => data.handleModifyPosition(positionId, mods)}
                onClosePosition={(positionId, exitPrice) => data.handleClosePosition(positionId, exitPrice)}
              />
            </Suspense>
          </div>
        </div>

        {/* RIGHT: Signal feed + panels (desktop) */}
        <div className="hidden lg:flex lg:flex-col border-l border-white/[0.04] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <SignalFeed onTrade={handleSignalTrade} />
        </div>
      </div>

      {/* === MOBILE BOTTOM PANELS === */}
      <div className="lg:hidden mt-2">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto px-3 pb-1" style={{ scrollbarWidth: "none" }}>
          {panelTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActivePanel(tab.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                activePanel === tab.key
                  ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                  : "text-slate-400 border-transparent hover:text-white"
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="ml-1 text-[9px] bg-blue-500/30 rounded-full px-1">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Active panel content */}
        <div className="min-h-[200px]">
          {activePanel === "signals" && (
            <SignalFeed onTrade={handleSignalTrade} />
          )}

          {activePanel === "positions" && (
            <PositionsStrip
              positions={data.positions}
              prices={data.prices}
              wallet={data.wallet}
              onClose={data.handleClosePosition}
              onModify={data.handleModifyPosition}
              onViewChart={handleViewChart}
              onRefresh={data.refreshData}
            />
          )}

          {activePanel === "order" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpOrderForm
                  markets={data.markets}
                  prices={data.prices}
                  maxBalance={data.account?.balance || 0}
                  onSubmit={data.handlePlaceOrder}
                  loading={data.loading}
                  initialSymbol={data.selectedSymbol}
                />
              </div>
            </Suspense>
          )}

          {activePanel === "strategy" && data.wallet && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpStrategyPanel wallet={data.wallet} />
              </div>
            </Suspense>
          )}

          {activePanel === "pending" && data.wallet && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpPendingOrders wallet={data.wallet} />
              </div>
            </Suspense>
          )}

          {activePanel === "equity" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpEquityChart data={data.equity} />
              </div>
            </Suspense>
          )}

          {activePanel === "metrics" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpMetricsPanel metrics={data.account?.metrics || {
                  total_trades: 0, winning_trades: 0, losing_trades: 0,
                  win_rate: 0, profit_factor: 0, avg_rr_ratio: 0, sharpe_ratio: 0,
                  sortino_ratio: 0, max_drawdown: 0, expectancy: 0, kelly_criterion: 0,
                  avg_holding_period: "0h", total_pnl: 0, total_fees: 0, total_funding: 0,
                  best_trade: 0, worst_trade: 0, avg_win: 0, avg_loss: 0,
                  consecutive_wins: 0, consecutive_losses: 0,
                }} />
              </div>
            </Suspense>
          )}

          {activePanel === "history" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpTradeHistory trades={data.trades} onRefresh={data.refreshData} />
              </div>
            </Suspense>
          )}

          {activePanel === "ai" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <AIAnalysisPanel />
              </div>
            </Suspense>
          )}
        </div>
      </div>

      {/* Desktop bottom panels — under chart */}
      <div className="hidden lg:block border-t border-white/[0.04] bg-[#060b18]">
        {/* Tab bar */}
        <div className="flex gap-1 px-3 py-1.5 border-b border-white/[0.04]" style={{ scrollbarWidth: "none" }}>
          {panelTabs.filter(t => t.key !== "signals").map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActivePanel(tab.key)}
              className={`flex-shrink-0 px-3 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                activePanel === tab.key
                  ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                  : "text-slate-500 border-transparent hover:text-white"
              }`}
            >
              {tab.label}
              {tab.badge && tab.badge > 0 && (
                <span className="ml-1 text-[8px] bg-blue-500/30 rounded-full px-1">{tab.badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* Desktop panel content */}
        <div className="max-h-[300px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          {activePanel === "positions" && (
            <PositionsStrip
              positions={data.positions}
              prices={data.prices}
              wallet={data.wallet}
              onClose={data.handleClosePosition}
              onModify={data.handleModifyPosition}
              onViewChart={handleViewChart}
              onRefresh={data.refreshData}
            />
          )}

          {activePanel === "order" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpOrderForm
                  markets={data.markets}
                  prices={data.prices}
                  maxBalance={data.account?.balance || 0}
                  onSubmit={data.handlePlaceOrder}
                  loading={data.loading}
                  initialSymbol={data.selectedSymbol}
                />
              </div>
            </Suspense>
          )}

          {activePanel === "strategy" && data.wallet && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpStrategyPanel wallet={data.wallet} />
              </div>
            </Suspense>
          )}

          {activePanel === "pending" && data.wallet && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpPendingOrders wallet={data.wallet} />
              </div>
            </Suspense>
          )}

          {activePanel === "equity" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpEquityChart data={data.equity} />
              </div>
            </Suspense>
          )}

          {activePanel === "metrics" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpMetricsPanel metrics={data.account?.metrics || {
                  total_trades: 0, winning_trades: 0, losing_trades: 0,
                  win_rate: 0, profit_factor: 0, avg_rr_ratio: 0, sharpe_ratio: 0,
                  sortino_ratio: 0, max_drawdown: 0, expectancy: 0, kelly_criterion: 0,
                  avg_holding_period: "0h", total_pnl: 0, total_fees: 0, total_funding: 0,
                  best_trade: 0, worst_trade: 0, avg_win: 0, avg_loss: 0,
                  consecutive_wins: 0, consecutive_losses: 0,
                }} />
              </div>
            </Suspense>
          )}

          {activePanel === "history" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <PerpTradeHistory trades={data.trades} onRefresh={data.refreshData} />
              </div>
            </Suspense>
          )}

          {activePanel === "ai" && (
            <Suspense fallback={<ChartLoader />}>
              <div className="p-3">
                <AIAnalysisPanel />
              </div>
            </Suspense>
          )}
        </div>
      </div>

      {/* Quick trade FAB (mobile) */}
      <button
        onClick={() => { setTradeSheetPrefill(null); setTradeSheetOpen(true); }}
        className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-blue-500 text-white text-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center"
      >
        +
      </button>

      {/* Quick trade sheet */}
      <QuickTradeSheet
        isOpen={tradeSheetOpen}
        onClose={() => setTradeSheetOpen(false)}
        onSubmit={data.handlePlaceOrder}
        prefill={tradeSheetPrefill}
        markets={data.markets}
        prices={data.prices}
        maxBalance={data.account?.balance || 0}
        isLive={data.isLive}
        loading={data.loading}
      />

      {/* Link to classic view */}
      <div className="text-center py-4">
        <button
          onClick={() => navigate("/trade/classic")}
          className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          Classic view
        </button>
      </div>
    </div>
  );
};

export default TradeDashboard;
