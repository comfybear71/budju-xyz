import { useCallback, useState, lazy, Suspense } from "react";
import { APP_NAME } from "@constants/config";
import { useEffect } from "react";
import { useDashboardData } from "./hooks/useDashboardData";
import MarketPills from "./components/dashboard/MarketPills";
import PositionsStrip from "./components/dashboard/PositionsStrip";
import PerpPositionsList from "./components/perps/PerpPositionsList";
import PerpTradeHistory from "./components/perps/PerpTradeHistory";

const TradingChart = lazy(() => import("./components/perps/TradingChart"));
const PerpOrderForm = lazy(() => import("./components/perps/PerpOrderForm"));
const PerpStrategyPanel = lazy(() => import("./components/perps/PerpStrategyPanel"));
const StrategyMarquee = lazy(() => import("./components/perps/StrategyMarquee"));

const ChartLoader = () => (
  <div className="flex items-center justify-center h-full bg-slate-900/50 rounded-xl">
    <div className="text-[11px] text-slate-400 animate-pulse">Loading chart...</div>
  </div>
);

interface TradeDashboardProps {
  onClose?: () => void;
}

const TradeDashboard = (_props: TradeDashboardProps) => {
  const data = useDashboardData();
  const [showPositions, setShowPositions] = useState(false);
  const [showStrategies, setShowStrategies] = useState(false);
  const [showTradeHistory, setShowTradeHistory] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(true);

  // Page title
  useEffect(() => {
    document.title = `Dashboard - ${APP_NAME}`;
    window.scrollTo(0, 0);
  }, []);

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

  return (
    <div className="min-h-screen bg-[#060b18]">
      {/* BotControlBar removed for clean mobile UI */}

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

      {/* Strategy opportunity marquee */}
      <Suspense fallback={null}>
        <StrategyMarquee />
      </Suspense>

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
          <div className="lg:h-full">
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

        {/* RIGHT sidebar removed — signals available via dedicated tab later */}
      </div>

      {/* Order form — collapsible */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setShowOrderForm(!showOrderForm)}
          className="flex items-center gap-2 w-full mb-2"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Trade
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showOrderForm ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {showOrderForm && (
          <Suspense fallback={<ChartLoader />}>
            <PerpOrderForm
              markets={data.markets}
              prices={data.prices}
              maxBalance={data.account?.balance || 0}
              onSubmit={data.handlePlaceOrder}
              loading={data.loading}
              initialSymbol={data.selectedSymbol}
              hideMarketSelect
              wallet={data.wallet}
            />
          </Suspense>
        )}
      </div>

      {/* Positions — collapsible, below order form */}
      <div className="px-3 pb-3">
        <button
          onClick={() => setShowPositions(!showPositions)}
          className="flex items-center gap-2 w-full mb-2"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Positions
          </span>
          {data.positions.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-emerald-500/30 text-emerald-400 text-[9px] flex items-center justify-center border border-emerald-500/40">
              {data.positions.length}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showPositions ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {showPositions && (
          <PerpPositionsList
            positions={data.positions}
            onClose={data.handleClosePosition}
            onModify={(positionId) => data.handleModifyPosition(positionId, {})}
            onRefresh={data.refreshData}
            wallet={data.wallet}
            livePrices={data.prices}
            onNewTrade={(symbol) => {
              data.setSelectedSymbol(symbol);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {/* Strategies — collapsible, below positions */}
        <button
          onClick={() => setShowStrategies(!showStrategies)}
          className="flex items-center gap-2 w-full mb-2 mt-3"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Strategies
          </span>
          {data.strategyStatus?.strategies && (
            <span className="w-4 h-4 rounded-full bg-blue-500/30 text-blue-400 text-[9px] flex items-center justify-center border border-blue-500/40">
              {Object.keys(data.strategyStatus.strategies).length}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showStrategies ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {showStrategies && data.wallet && (
          <div className="max-h-[60vh] overflow-y-auto rounded-xl" style={{ scrollbarWidth: "thin" }}>
            <Suspense fallback={<div className="text-[11px] text-slate-400 animate-pulse py-4 text-center">Loading strategies...</div>}>
              <PerpStrategyPanel wallet={data.wallet} />
            </Suspense>
          </div>
        )}

        {/* Trade History — collapsible, below strategies */}
        <button
          onClick={() => setShowTradeHistory(!showTradeHistory)}
          className="flex items-center gap-2 w-full mb-2 mt-3"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Trade History
          </span>
          {data.trades.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-400 text-[9px] flex items-center justify-center border border-amber-500/40">
              {Math.min(data.trades.length, 5)}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showTradeHistory ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {showTradeHistory && (
          <PerpTradeHistory
            trades={data.trades.slice(0, 5)}
            onRefresh={data.refreshData}
          />
        )}
      </div>
    </div>
  );
};

export default TradeDashboard;
