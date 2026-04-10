import { useCallback, useState, lazy, Suspense } from "react";
import { APP_NAME } from "@constants/config";
import { useEffect } from "react";
import { useDashboardData } from "./hooks/useDashboardData";
import MarketPills from "./components/dashboard/MarketPills";
import PerpPositionsList from "./components/perps/PerpPositionsList";
import PerpTradeHistory from "./components/perps/PerpTradeHistory";
import PerpEquityChart from "./components/perps/PerpEquityChart";
import { fetchPerpEquity } from "./services/perpApi";

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
  isAdmin?: boolean;
}

const TradeDashboard = ({ onClose, isAdmin = false }: TradeDashboardProps) => {
  const data = useDashboardData();
  const [showPositions, setShowPositions] = useState(false);
  const [showStrategies, setShowStrategies] = useState(false);
  const [showTradeHistory, setShowTradeHistory] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
  const [equityPeriod, setEquityPeriod] = useState("all");
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

      {/* Strategy opportunity marquee — hide symbols with open positions */}
      <Suspense fallback={null}>
        <StrategyMarquee openSymbols={data.positions.map(p => p.symbol)} />
      </Suspense>

      {/* Account summary — compact row with live-adjusted unrealized P&L */}
      {data.account && (() => {
        const liveUnrealized = data.positions.reduce((sum, pos) => {
          const livePrice = data.prices[pos.symbol] || pos.mark_price;
          const delta = pos.direction === "long" ? livePrice - pos.mark_price : pos.mark_price - livePrice;
          return sum + pos.unrealized_pnl + (delta / pos.entry_price) * pos.size_usd;
        }, 0);
        const liveEquity = data.account.balance + data.positions.reduce((s, p) => s + p.margin, 0) + liveUnrealized;
        return (
        <div className="grid grid-cols-5 gap-1.5 px-3 mb-2">
          {[
            { label: "Balance", value: `$${data.account.balance.toFixed(0)}` },
            { label: "Equity", value: `$${liveEquity.toFixed(0)}`, color: liveEquity >= 10000 ? "text-emerald-400" : "text-red-400" },
            { label: "Unrealized", value: `${liveUnrealized >= 0 ? "+" : ""}$${liveUnrealized.toFixed(0)}`, color: liveUnrealized >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Realized", value: `${data.account.realized_pnl >= 0 ? "+" : ""}$${data.account.realized_pnl.toFixed(0)}`, color: data.account.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400" },
            { label: "Win Rate", value: data.account.metrics.total_trades > 0 ? `${data.account.metrics.win_rate.toFixed(0)}%` : "—" },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/30 rounded-lg px-2 py-1.5 border border-white/[0.03]">
              <div className="text-[8px] text-slate-600 uppercase">{s.label}</div>
              <div className={`text-[11px] font-bold ${s.color || "text-white"}`}>{s.value}</div>
            </div>
          ))}
        </div>
        );
      })()}

      {/* === MAIN CONTENT === */}
      <div className="px-3">
        <Suspense fallback={<ChartLoader />}>
          <TradingChart
            symbol={data.selectedSymbol}
            baseAsset={data.selectedBaseAsset}
            positions={data.positions.filter((p) => p.symbol === data.selectedSymbol)}
            trades={data.trades.filter((t) => t.symbol === data.selectedSymbol)}
            height={undefined}
            strategyStatus={data.strategyStatus}
            onModifySLTP={isAdmin ? (positionId, mods) => data.handleModifyPosition(positionId, mods) : undefined}
            onClosePosition={isAdmin ? (positionId, exitPrice) => data.handleClosePosition(positionId, exitPrice) : undefined}
          />
        </Suspense>
      </div>

      {/* Order form — collapsible, admin only */}
      {isAdmin && (
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
      )}

      {/* Positions — collapsible, below order form */}
      <div className="px-3 pb-3 pt-2">
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
            onModify={(positionId, mods) => data.handleModifyPosition(positionId, mods)}
            onRefresh={data.refreshData}
            wallet={data.wallet}
            livePrices={data.prices}
            onViewChart={handleViewChart}
            readOnly={!isAdmin}
            onNewTrade={isAdmin ? (symbol) => {
              data.setSelectedSymbol(symbol);
              setShowOrderForm(true);
              window.scrollTo({ top: 0, behavior: "smooth" });
            } : undefined}
          />
        )}

        {/* Strategies — collapsible, below positions, admin only */}
        {isAdmin && (<>
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
        </>)}

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

        {/* Performance — collapsible */}
        <button
          onClick={() => setShowPerformance(!showPerformance)}
          className="flex items-center gap-2 w-full mb-2 mt-3"
        >
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Performance
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`w-3.5 h-3.5 text-slate-500 transition-transform ${showPerformance ? "rotate-180" : ""}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        {showPerformance && (
          <div className="space-y-3 mb-3">
            {/* Equity Curve */}
            <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Equity Curve
              </div>
              <PerpEquityChart
                data={data.equity}
                onPeriodChange={(p) => {
                  setEquityPeriod(p);
                  if (data.wallet) {
                    fetchPerpEquity(data.wallet, p).then((res) => {
                      // Update equity data — force re-render via key
                    }).catch(() => {});
                  }
                }}
              />
            </div>

            {/* Daily P&L */}
            {data.trades.length > 0 && (() => {
              // Group trades by date
              const dailyPnl: Record<string, number> = {};
              for (const t of data.trades) {
                const d = new Date(t.exit_time || t.entry_time).toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
                dailyPnl[d] = (dailyPnl[d] || 0) + (t.realized_pnl || 0);
              }
              const days = Object.entries(dailyPnl).slice(-14); // Last 14 days
              if (days.length === 0) return null;
              const maxAbs = Math.max(...days.map(([, v]) => Math.abs(v)), 1);

              return (
                <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Daily P&L
                  </div>
                  <div className="flex items-end gap-1" style={{ height: 80 }}>
                    {days.map(([day, pnl]) => {
                      const pct = Math.abs(pnl) / maxAbs;
                      const isWin = pnl >= 0;
                      return (
                        <div key={day} className="flex-1 flex flex-col items-center justify-end h-full">
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${Math.max(pct * 100, 4)}%`,
                              background: isWin ? "rgba(16,185,129,0.6)" : "rgba(239,68,68,0.6)",
                              minHeight: 3,
                            }}
                            title={`${day}: ${isWin ? "+" : ""}$${pnl.toFixed(2)}`}
                          />
                          <span className="text-[7px] text-slate-500 mt-1 truncate w-full text-center">{day.split(" ")[0]}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[9px] mt-1">
                    <span className="text-slate-500">{days.length} days</span>
                    <span className={Object.values(dailyPnl).reduce((s, v) => s + v, 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      Total: {Object.values(dailyPnl).reduce((s, v) => s + v, 0) >= 0 ? "+" : ""}
                      ${Object.values(dailyPnl).reduce((s, v) => s + v, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Strategy Win Rates */}
            {data.strategyStatus?.strategy_performance && Object.keys(data.strategyStatus.strategy_performance).length > 0 && (
              <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Strategy Win Rates (Rolling 20 Trades)
                </div>
                <div className="space-y-1.5">
                  {Object.entries(data.strategyStatus.strategy_performance)
                    .sort(([, a], [, b]) => b.rolling_win_rate - a.rolling_win_rate)
                    .map(([key, perf]) => {
                      const wr = perf.rolling_win_rate;
                      const wrPct = Math.round(wr * 100);
                      const barColor = wr >= 0.55 ? "#10b981" : wr >= 0.35 ? "#eab308" : "#ef4444";
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-400 w-24 truncate" title={`${perf.strategy} · ${perf.symbol}`}>
                            {perf.strategy.replace(/_/g, " ")}
                          </span>
                          <span className="text-[8px] text-slate-500 w-10 truncate">
                            {perf.symbol.replace("-PERP", "")}
                          </span>
                          <div className="flex-1 h-3 bg-slate-800/60 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${wrPct}%`, background: barColor }}
                            />
                          </div>
                          <span className="text-[9px] font-bold font-mono w-10 text-right" style={{ color: barColor }}>
                            {wrPct}%
                          </span>
                          <span className="text-[8px] text-slate-500 w-6 text-right">
                            {perf.trades_in_window}t
                          </span>
                          {perf.auto_disabled && (
                            <span className="text-[7px] font-bold text-red-400">OFF</span>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Win/Loss badges strip — always visible */}
        {data.account && data.account.metrics.total_trades > 0 && (() => {
          const last10 = data.trades.slice(0, 10).reverse();
          const dur = Math.max(last10.length * 1.2, 6);
          const renderCard = (trade: (typeof data.trades)[0], i: number) => {
            const win = trade.realized_pnl >= 0;
            return (
              <div
                key={i}
                className="flex-shrink-0 flex flex-col items-center justify-center rounded-lg px-2 py-2.5"
                style={{
                  minWidth: 38,
                  background: win ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${win ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                }}
                title={`${trade.symbol} ${win ? "+" : ""}$${trade.realized_pnl.toFixed(2)}`}
              >
                <span className={`text-[9px] font-bold ${win ? "text-emerald-400" : "text-red-400"}`}>
                  {trade.symbol.replace(/USDT?$/, "").slice(0, 4)}
                </span>
                <span className={`text-[8px] font-semibold mt-0.5 ${win ? "text-emerald-300" : "text-red-300"}`}>
                  {win ? "W" : "L"}
                </span>
              </div>
            );
          };
          return (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Results</span>
                <span className="text-[10px] text-slate-400">
                  {data.account.metrics.winning_trades}W / {data.account.metrics.losing_trades}L
                </span>
                <span className="text-[10px] font-bold text-slate-300">
                  {data.account.metrics.win_rate.toFixed(0)}%
                </span>
              </div>
              <div
                className="relative overflow-x-auto no-scrollbar rounded-lg"
                ref={(el) => { if (el) el.scrollLeft = el.scrollWidth; }}
                onMouseEnter={(e) => {
                  const inner = e.currentTarget.querySelector<HTMLElement>("[data-results-marquee]");
                  if (inner) inner.style.animationPlayState = "paused";
                }}
                onMouseLeave={(e) => {
                  const inner = e.currentTarget.querySelector<HTMLElement>("[data-results-marquee]");
                  if (inner) inner.style.animationPlayState = "running";
                }}
                onTouchStart={(e) => {
                  const inner = e.currentTarget.querySelector<HTMLElement>("[data-results-marquee]");
                  if (inner) inner.style.animationPlayState = "paused";
                }}
                onTouchEnd={(e) => {
                  const inner = e.currentTarget.querySelector<HTMLElement>("[data-results-marquee]");
                  if (inner) inner.style.animationPlayState = "running";
                }}
              >
                <div
                  data-results-marquee
                  className="flex gap-1 whitespace-nowrap"
                  style={{ animation: `results-marquee ${dur}s linear infinite` }}
                >
                  {last10.map((t, i) => renderCard(t, i))}
                  {last10.map((t, i) => renderCard(t, i + last10.length))}
                </div>
              </div>
              <style>{`
                @keyframes results-marquee {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-50%); }
                }
              `}</style>
            </div>
          );
        })()}

        {/* Paper / Live / Kill controls — admin only */}
        {isAdmin && data.wallet && (
          <div className="flex items-center flex-wrap gap-1.5 mt-3">
            <button
              onClick={data.handleKillSwitch}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                data.isKillSwitchActive
                  ? "bg-red-600/30 text-red-200 border-red-500/60 animate-pulse"
                  : "bg-slate-800/50 text-slate-400 border-slate-600/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40"
              }`}
            >
              {data.isKillSwitchActive ? "🚨 KILL ON" : "🚨 KILL"}
            </button>
            <button
              onClick={data.handleSwitchMode}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                data.isLive
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : "bg-slate-800/50 text-slate-400 border-slate-600/30 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40"
              }`}
            >
              {data.isLive ? "🔴 LIVE" : "📝 PAPER"}
            </button>
            {data.autoTradingEnabled !== null && (
              <button
                onClick={data.handleToggleBot}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                  data.autoTradingEnabled
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-red-500/20 text-red-300 border-red-500/40"
                }`}
              >
                {data.autoTradingEnabled ? "⚡ BOT ON" : "⚡ BOT OFF"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeDashboard;
