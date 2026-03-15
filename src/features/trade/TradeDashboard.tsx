import { useCallback, lazy, Suspense } from "react";
import { APP_NAME } from "@constants/config";
import { useEffect } from "react";
import { useDashboardData } from "./hooks/useDashboardData";
import MarketPills from "./components/dashboard/MarketPills";
import PositionsStrip from "./components/dashboard/PositionsStrip";

const TradingChart = lazy(() => import("./components/perps/TradingChart"));
const PerpOrderForm = lazy(() => import("./components/perps/PerpOrderForm"));

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

        {/* RIGHT sidebar removed — signals available via dedicated tab later */}
      </div>

      {/* Order form — always visible */}
      <div className="p-3">
        <Suspense fallback={<ChartLoader />}>
          <PerpOrderForm
            markets={data.markets}
            prices={data.prices}
            maxBalance={data.account?.balance || 0}
            onSubmit={data.handlePlaceOrder}
            loading={data.loading}
            initialSymbol={data.selectedSymbol}
          />
        </Suspense>
      </div>
    </div>
  );
};

export default TradeDashboard;
