import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useWallet } from "@hooks/useWallet";
import { useLivePrices } from "@hooks/useLivePrices";
import PerpAccountSummary from "./PerpAccountSummary";
import PerpPositionsList from "./PerpPositionsList";
import PerpOrderForm from "./PerpOrderForm";
import PerpPendingOrders from "./PerpPendingOrders";
import PerpMetricsPanel from "./PerpMetricsPanel";
import PerpTradeHistory from "./PerpTradeHistory";
import PerpEquityChart from "./PerpEquityChart";
import DashboardCharts from "./DashboardCharts";
import AIAnalysisPanel from "./AIAnalysisPanel";
import PerpStrategyPanel from "./PerpStrategyPanel";
import {
  fetchPerpAccount,
  fetchPerpPositions,
  fetchPerpTrades,
  fetchPerpEquity,
  fetchPerpMarkets,
  fetchPublicPerpData,
  fetchStrategyStatus,
  toggleAutoTrading,
  placePerpOrder,
  closePerpPosition,
  modifyPerpPosition,
  resetPerpAccount,
  setTradingMode,
  setKillSwitch,
} from "../../services/perpApi";
import type {
  PerpAccount,
  PerpPosition,
  PerpTrade,
  PerpMarket,
  PerpEquitySnapshot,
  PerpOrderRequest,
} from "../../types/perps";

interface Props {
  onClose: () => void;
  readOnly?: boolean;
}

type Tab = "charts" | "positions" | "order" | "pending" | "history" | "metrics" | "equity" | "ai" | "strategy";

const HighRiskDashboard = ({ onClose, readOnly = false }: Props) => {
  const { connection } = useWallet();

  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [positions, setPositions] = useState<PerpPosition[]>([]);
  const [trades, setTrades] = useState<PerpTrade[]>([]);
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [equity, setEquity] = useState<PerpEquitySnapshot[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("charts");
  const [chartSymbol, setChartSymbol] = useState<string | undefined>(undefined);
  const [orderSymbol, setOrderSymbol] = useState<string | undefined>(undefined);
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modifySL, setModifySL] = useState("");
  const [modifyTP, setModifyTP] = useState("");
  const [modifyTrail, setModifyTrail] = useState("");
  const [autoTradingEnabled, setAutoTradingEnabled] = useState<boolean | null>(null);
  const [togglingBot, setTogglingBot] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);
  const [togglingKillSwitch, setTogglingKillSwitch] = useState(false);

  const wallet = connection.wallet?.address;
  // Auto-detect admin: if wallet is connected, treat as full access (not read-only)
  const isWalletConnected = !!wallet;
  const effectiveReadOnly = readOnly && !isWalletConnected;

  // Real-time Binance WS prices for order form (replaces CoinGecko polling for supported coins)
  const { prices: wsPrices } = useLivePrices(1000);

  // Merge WS prices into perp prices (map base asset → symbol format)
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0 || markets.length === 0) return;
    const merged: Record<string, number> = {};
    for (const m of markets) {
      if (wsPrices[m.base_asset]) merged[m.symbol] = wsPrices[m.base_asset];
    }
    if (Object.keys(merged).length > 0) {
      setPrices((prev) => ({ ...prev, ...merged }));
    }
  }, [wsPrices, markets]);

  // Fallback markets when API hasn't loaded yet
  const DEFAULT_MARKETS: PerpMarket[] = [
    { symbol: "SOL-PERP", base_asset: "SOL", max_leverage: 50, tick_size: 0.01, coingecko_id: "solana" },
    { symbol: "BTC-PERP", base_asset: "BTC", max_leverage: 50, tick_size: 0.1, coingecko_id: "bitcoin" },
    { symbol: "ETH-PERP", base_asset: "ETH", max_leverage: 50, tick_size: 0.01, coingecko_id: "ethereum" },
    { symbol: "DOGE-PERP", base_asset: "DOGE", max_leverage: 20, tick_size: 0.00001, coingecko_id: "dogecoin" },
    { symbol: "AVAX-PERP", base_asset: "AVAX", max_leverage: 20, tick_size: 0.01, coingecko_id: "avalanche-2" },
    { symbol: "LINK-PERP", base_asset: "LINK", max_leverage: 20, tick_size: 0.001, coingecko_id: "chainlink" },
    { symbol: "SUI-PERP", base_asset: "SUI", max_leverage: 20, tick_size: 0.001, coingecko_id: "sui" },
    { symbol: "JUP-PERP", base_asset: "JUP", max_leverage: 10, tick_size: 0.0001, coingecko_id: "jupiter-exchange-solana" },
    { symbol: "WIF-PERP", base_asset: "WIF", max_leverage: 10, tick_size: 0.0001, coingecko_id: "dogwifcoin" },
    { symbol: "BONK-PERP", base_asset: "BONK", max_leverage: 10, tick_size: 0.00000001, coingecko_id: "bonk" },
  ];

  const loadData = useCallback(async () => {
    if (!wallet && !effectiveReadOnly) return;
    // In read-only mode without wallet, fetch public data (admin paper trading)
    if (!wallet) {
      try {
        const data = await fetchPublicPerpData();
        setAccount(data.account);
        setPositions(data.positions);
        setTrades(data.trades);
        setEquity(data.equity);
        if (data.markets.length > 0) setMarkets(data.markets);
        else if (markets.length === 0) setMarkets(DEFAULT_MARKETS);
      } catch (err) {
        console.warn("[HighRisk] Public data fetch failed:", err);
        if (markets.length === 0) setMarkets(DEFAULT_MARKETS);
      }
      setInitialLoading(false);
      return;
    }
    try {
      const results = await Promise.allSettled([
        fetchPerpAccount(wallet),
        fetchPerpPositions(wallet),
        fetchPerpTrades(wallet),
        fetchPerpMarkets(),
        fetchPerpEquity(wallet, "all"),
      ]);

      if (results[0].status === "fulfilled") setAccount(results[0].value);
      if (results[1].status === "fulfilled") setPositions(results[1].value.positions);
      if (results[2].status === "fulfilled") setTrades(results[2].value.trades);
      if (results[3].status === "fulfilled" && results[3].value.markets.length > 0) {
        setMarkets(results[3].value.markets);
      } else if (markets.length === 0) {
        setMarkets(DEFAULT_MARKETS);
      }
      if (results[4].status === "fulfilled") setEquity(results[4].value.equity);

      // Extract prices from positions' mark prices
      const p: Record<string, number> = {};
      if (results[1].status === "fulfilled") {
        results[1].value.positions.forEach((position: PerpPosition) => {
          if (position.mark_price > 0) p[position.symbol] = position.mark_price;
        });
      }
      setPrices((prev) => ({ ...prev, ...p }));

      // Log any errors for debugging
      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(`[HighRisk] API call ${i} failed:`, r.reason);
        }
      });
    } catch (err) {
      console.error("Failed to load perp data:", err);
    } finally {
      setInitialLoading(false);
    }
  }, [wallet, effectiveReadOnly]);

  // Set default markets immediately so the UI is usable before API loads
  useEffect(() => {
    if (markets.length === 0) setMarkets(DEFAULT_MARKETS);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [loadData]);

  // Fetch auto-trading status
  useEffect(() => {
    if (!wallet) return;
    const loadBotStatus = async () => {
      try {
        const status = await fetchStrategyStatus(wallet);
        setAutoTradingEnabled(status.auto_trading_enabled);
      } catch {
        // Strategy endpoint may not be available yet
      }
    };
    loadBotStatus();
    const interval = setInterval(loadBotStatus, 30_000);
    return () => clearInterval(interval);
  }, [wallet]);

  const handleToggleBot = async () => {
    if (!wallet || autoTradingEnabled === null) return;
    try {
      setTogglingBot(true);
      await toggleAutoTrading(!autoTradingEnabled, wallet);
      setAutoTradingEnabled(!autoTradingEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle bot");
    } finally {
      setTogglingBot(false);
    }
  };

  // Fetch live prices for order form
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = markets.map((m) => m.coingecko_id).join(",");
        if (!ids) return;
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        );
        const data = await res.json();
        const p: Record<string, number> = {};
        markets.forEach((m) => {
          if (data[m.coingecko_id]?.usd) p[m.symbol] = data[m.coingecko_id].usd;
        });
        setPrices((prev) => ({ ...prev, ...p }));
      } catch {
        // Prices will come from position updates
      }
    };
    if (markets.length > 0) fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, [markets]);

  const handlePlaceOrder = async (order: PerpOrderRequest) => {
    if (!wallet) { setError("Wallet not connected"); return; }
    try {
      setLoading(true);
      setError(null);
      await placePerpOrder(order, wallet);
      await loadData();
      setActiveTab("positions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async (positionId: string, exitPrice: number) => {
    if (!wallet) { setError("Wallet not connected"); return; }
    try {
      setLoading(true);
      setError(null);
      await closePerpPosition(positionId, exitPrice, "manual", wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setLoading(false);
    }
  };

  const handleModifyPosition = async (positionId: string) => {
    if (modifyingId === positionId) {
      if (!wallet) { setError("Wallet not connected"); return; }
      // Submit modification
      try {
        setLoading(true);
        await modifyPerpPosition(
          positionId,
          {
            stopLoss: modifySL ? parseFloat(modifySL) : undefined,
            takeProfit: modifyTP ? parseFloat(modifyTP) : undefined,
            trailingStopPct: modifyTrail ? parseFloat(modifyTrail) : undefined,
          },
          wallet,
        );
        setModifyingId(null);
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to modify");
      } finally {
        setLoading(false);
      }
    } else {
      // Start editing
      const pos = positions.find((p) => p._id === positionId);
      setModifySL(pos?.stop_loss?.toString() || "");
      setModifyTP(pos?.take_profit?.toString() || "");
      setModifyTrail(pos?.trailing_stop_distance?.toString() || "");
      setModifyingId(positionId);
    }
  };

  const handleReset = async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    if (!confirm("Reset paper trading account to $10,000? All positions and history will be deleted.")) return;
    try {
      setLoading(true);
      await resetPerpAccount(wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setLoading(false);
    }
  };

  const isLive = account?.trading_mode === "live";
  const isKillSwitchActive = account?.kill_switch === true;

  const handleSwitchMode = async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    const newMode = isLive ? "paper" : "live";
    if (newMode === "live") {
      if (!confirm(
        "⚠️ SWITCH TO LIVE TRADING ⚠️\n\n" +
        "This will use REAL FUNDS on Drift Protocol (Solana).\n" +
        "Make sure you have:\n" +
        "• DRIFT_PRIVATE_KEY set\n" +
        "• Solana RPC configured (HELIUS_API_KEY)\n" +
        "• USDC deposited on Drift + SOL for gas\n\n" +
        "Are you absolutely sure?"
      )) return;
    }
    try {
      setSwitchingMode(true);
      setError(null);
      await setTradingMode(wallet, newMode);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch mode");
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    const activating = !isKillSwitchActive;
    if (activating) {
      if (!confirm(
        "🚨 ACTIVATE KILL SWITCH 🚨\n\n" +
        "This will IMMEDIATELY:\n" +
        "• Close ALL open positions\n" +
        "• Pause all trading\n" +
        "• Stop the auto-trading bot\n\n" +
        "Continue?"
      )) return;
    }
    try {
      setTogglingKillSwitch(true);
      setError(null);
      await setKillSwitch(wallet, activating);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kill switch failed");
    } finally {
      setTogglingKillSwitch(false);
    }
  };

  const allTabs: { key: Tab; label: string; icon: string }[] = [
    { key: "charts", label: "Charts", icon: "📈" },
    { key: "strategy", label: "Bot", icon: "⚡" },
    { key: "positions", label: "Positions", icon: "📍" },
    { key: "order", label: "New Order", icon: "📝" },
    { key: "pending", label: "Orders", icon: "📋" },
    { key: "equity", label: "Equity", icon: "💹" },
    { key: "metrics", label: "Metrics", icon: "📊" },
    { key: "history", label: "History", icon: "📋" },
    { key: "ai", label: "AI", icon: "🤖" },
  ];
  // Read-only users see everything except New Order and Strategy (admin-only)
  const readOnlyExclude: Tab[] = ["order", "pending", "strategy"];
  const tabs = effectiveReadOnly ? allTabs.filter((t) => !readOnlyExclude.includes(t.key)) : allTabs;

  if (!wallet && !effectiveReadOnly) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-[#0f172a]/60 backdrop-blur-sm p-6 text-center">
        <span className="text-2xl">🔒</span>
        <p className="text-sm text-slate-400 mt-2">Connect wallet to access paper trading.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-2xl border border-red-500/20 bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className={`px-4 py-3 border-b ${
        isLive ? "border-red-500/30 bg-red-950/20" : "border-red-500/10"
      }`}>
        {/* Top: title + close button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg flex-shrink-0">{isLive ? "🔴" : "🔥"}</span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-red-400 truncate">
                {effectiveReadOnly
                  ? "LIVE CHARTS"
                  : isLive
                    ? "HIGH RISK — LIVE TRADING"
                    : "HIGH RISK — PAPER TRADING"}
              </h3>
              <p className="text-[10px] text-slate-500 truncate">
                {effectiveReadOnly
                  ? "Real-time charts with AI predictions • Read only"
                  : isLive
                    ? "Real funds on Drift Protocol • Trades use real money"
                    : "Simulated perpetual futures • No real funds at risk"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-sm flex-shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
        {/* Action buttons row — wraps on narrow screens */}
        {!effectiveReadOnly && wallet && (
          <div className="flex items-center flex-wrap gap-1.5 mt-2">
            {/* Kill Switch */}
            <button
              onClick={handleKillSwitch}
              disabled={togglingKillSwitch}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                isKillSwitchActive
                  ? "bg-red-600/30 text-red-200 border-red-500/60 animate-pulse"
                  : "bg-slate-800/50 text-slate-400 border-slate-600/30 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40"
              } disabled:opacity-40`}
              title={isKillSwitchActive ? "Kill switch ACTIVE — click to deactivate" : "Emergency: close all positions and stop trading"}
            >
              {togglingKillSwitch ? "..." : isKillSwitchActive ? "🚨 KILL ON" : "🚨 KILL"}
            </button>

            {/* Paper/Live Mode Toggle */}
            <button
              onClick={handleSwitchMode}
              disabled={switchingMode}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                isLive
                  ? "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-slate-800/50 hover:text-slate-300"
                  : "bg-slate-800/50 text-slate-400 border-slate-600/30 hover:bg-amber-500/20 hover:text-amber-300 hover:border-amber-500/40"
              } disabled:opacity-40`}
              title={isLive ? "Switch to PAPER trading" : "Switch to LIVE trading (real funds)"}
            >
              {switchingMode ? "..." : isLive ? "🔴 LIVE" : "📝 PAPER"}
            </button>

            {/* Auto-trading START/STOP */}
            {autoTradingEnabled !== null && (
              <button
                onClick={handleToggleBot}
                disabled={togglingBot}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${
                  autoTradingEnabled
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40"
                    : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-emerald-500/20 hover:text-emerald-300 hover:border-emerald-500/40"
                } disabled:opacity-40`}
                title={autoTradingEnabled ? "Click to STOP auto-trading" : "Click to START auto-trading"}
              >
                {togglingBot ? "..." : autoTradingEnabled ? "⚡ BOT ON" : "⚡ BOT OFF"}
              </button>
            )}
            {account?.trading_paused && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                PAUSED
              </span>
            )}
            <button
              onClick={handleReset}
              className="text-[10px] px-2 py-1 rounded text-slate-500 hover:text-red-400 transition-colors"
              title="Reset account"
            >
              Reset
            </button>
          </div>
        )}
      </div>

      {/* Live mode warning banner */}
      {isLive && !effectiveReadOnly && (
        <div className="mx-4 mt-3 p-2 rounded-lg bg-red-900/30 border border-red-500/30 flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <span className="text-[11px] text-red-300 font-medium">
            LIVE TRADING ACTIVE — Real funds at risk on Drift Protocol
          </span>
        </div>
      )}

      <div className="p-4 space-y-3">
        {/* Loading state */}
        {initialLoading && !effectiveReadOnly && (
          <div className="text-center py-4">
            <div className="animate-pulse text-sm text-slate-400">Loading paper trading account...</div>
          </div>
        )}

        {/* Account summary — visible to all (shows equity, balance, P&L) */}
        {account && <PerpAccountSummary account={account} />}
        {!account && !initialLoading && !effectiveReadOnly && (
          <PerpAccountSummary account={{
            wallet: wallet || "", balance: 10000, equity: 10000,
            unrealized_pnl: 0, realized_pnl: 0, total_funding_paid: 0,
            total_fees_paid: 0, total_trades: 0, winning_trades: 0,
            losing_trades: 0, max_drawdown: 0, peak_equity: 10000,
            daily_pnl: 0, trading_paused: false,
            created_at: "", updated_at: "",
            metrics: { total_trades: 0, winning_trades: 0, losing_trades: 0,
              win_rate: 0, profit_factor: 0, avg_rr_ratio: 0, sharpe_ratio: 0,
              sortino_ratio: 0, max_drawdown: 0, expectancy: 0, kelly_criterion: 0,
              avg_holding_period: "0h", total_pnl: 0, total_fees: 0, total_funding: 0,
              best_trade: 0, worst_trade: 0, avg_win: 0, avg_loss: 0,
              consecutive_wins: 0, consecutive_losses: 0 },
          }} />
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-slate-500 hover:text-white">✕</button>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                activeTab === tab.key
                  ? "bg-red-500/20 text-red-300 border-red-500/40"
                  : "text-slate-400 border-transparent hover:text-red-400"
              }`}
            >
              {tab.icon} {tab.label}
              {tab.key === "positions" && positions.length > 0 && (
                <span className="ml-1 text-[9px] bg-red-500/30 rounded-full px-1">{positions.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "charts" && (
          <DashboardCharts
            positions={positions}
            trades={trades}
            metrics={account?.metrics}
            wallet={wallet}
            onClose={() => setActiveTab(effectiveReadOnly ? "positions" : "order")}
            initialSymbol={chartSymbol}
            onRefresh={loadData}
          />
        )}

        {activeTab === "positions" && (
          <PerpPositionsList
            positions={positions}
            onClose={handleClosePosition}
            onModify={handleModifyPosition}
            onRefresh={loadData}
            readOnly={effectiveReadOnly}
            wallet={wallet}
            livePrices={prices}
            onViewChart={(symbol) => {
              setChartSymbol(symbol);
              setActiveTab("charts");
            }}
            onNewTrade={(symbol) => {
              setOrderSymbol(symbol);
              setActiveTab("order");
            }}
          />
        )}

        {activeTab === "order" && (
          <PerpOrderForm
            markets={markets}
            prices={prices}
            maxBalance={account?.balance || 0}
            onSubmit={handlePlaceOrder}
            loading={loading}
            initialSymbol={orderSymbol}
          />
        )}

        {activeTab === "pending" && wallet && (
          <PerpPendingOrders wallet={wallet} readOnly={effectiveReadOnly} />
        )}

        {activeTab === "equity" && (
          <PerpEquityChart
            data={equity}
            onPeriodChange={async (period) => {
              if (!wallet) return;
              const eq = await fetchPerpEquity(wallet, period);
              setEquity(eq.equity);
            }}
          />
        )}

        {activeTab === "metrics" && (
          <PerpMetricsPanel metrics={account?.metrics || {
            total_trades: 0, winning_trades: 0, losing_trades: 0,
            win_rate: 0, profit_factor: 0, avg_rr_ratio: 0, sharpe_ratio: 0,
            sortino_ratio: 0, max_drawdown: 0, expectancy: 0, kelly_criterion: 0,
            avg_holding_period: "0h", total_pnl: 0, total_fees: 0, total_funding: 0,
            best_trade: 0, worst_trade: 0, avg_win: 0, avg_loss: 0,
            consecutive_wins: 0, consecutive_losses: 0,
          }} />
        )}

        {activeTab === "history" && (
          <PerpTradeHistory trades={trades} onRefresh={loadData} />
        )}

        {activeTab === "ai" && (
          <AIAnalysisPanel />
        )}

        {activeTab === "strategy" && wallet && (
          <PerpStrategyPanel
            wallet={wallet}
          />
        )}
      </div>
    </motion.div>
  );
};

export default HighRiskDashboard;
