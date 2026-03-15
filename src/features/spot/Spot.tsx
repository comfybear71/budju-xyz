import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { FaSync, FaCircle, FaExclamationTriangle } from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import SpotPriceList from "./components/SpotPriceList";
import SpotOrderForm from "./components/SpotOrderForm";
import SpotPortfolio from "./components/SpotPortfolio";
import SpotTradeHistory from "./components/SpotTradeHistory";
import {
  fetchSpotAssets,
  fetchSpotPrices,
  fetchSpotPortfolio,
  fetchSpotTrades,
  fetchHealth,
  updateConfig,
  type SpotAsset,
  type SpotPortfolio as SpotPortfolioType,
  type SpotTrade,
  type PriceData,
} from "./services/spotApi";

const Spot = () => {
  const [connected, setConnected] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [tradingEnabled, setTradingEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assets, setAssets] = useState<SpotAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [portfolio, setPortfolio] = useState<SpotPortfolioType | null>(null);
  const [trades, setTrades] = useState<SpotTrade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("SOL");

  const [loading, setLoading] = useState(true);

  // Check VPS connection
  const checkConnection = useCallback(async () => {
    try {
      const health = await fetchHealth();
      setConnected(health.status === "ok");
      setDryRun(health.dry_run);
      setTradingEnabled(health.trading_enabled);
      setError(null);
    } catch {
      setConnected(false);
      setError("Cannot connect to VPS trading bot");
    }
  }, []);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    try {
      const [assetsRes, pricesRes, portfolioRes, tradesRes] = await Promise.allSettled([
        fetchSpotAssets(),
        fetchSpotPrices(),
        fetchSpotPortfolio(),
        fetchSpotTrades(20),
      ]);

      if (assetsRes.status === "fulfilled") setAssets(assetsRes.value.assets);
      if (pricesRes.status === "fulfilled") setPrices(pricesRes.value.prices);
      if (portfolioRes.status === "fulfilled") setPortfolio(portfolioRes.value);
      if (tradesRes.status === "fulfilled") setTrades(tradesRes.value.trades);
    } catch {
      // Individual errors handled by allSettled
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    checkConnection().then(() => fetchAll());
  }, [checkConnection, fetchAll]);

  // Auto-refresh prices every 5s
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(async () => {
      try {
        const pricesRes = await fetchSpotPrices();
        setPrices(pricesRes.prices);
      } catch {
        // Silently fail price refresh
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [connected]);

  // Auto-refresh portfolio every 15s
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(async () => {
      try {
        const [portfolioRes, tradesRes] = await Promise.all([
          fetchSpotPortfolio(),
          fetchSpotTrades(20),
        ]);
        setPortfolio(portfolioRes);
        setTrades(tradesRes.trades);
      } catch {
        // Silently fail
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [connected]);

  const handleTradeComplete = useCallback(async () => {
    // Refresh portfolio and trades after a trade
    try {
      const [portfolioRes, tradesRes] = await Promise.all([
        fetchSpotPortfolio(),
        fetchSpotTrades(20),
      ]);
      setPortfolio(portfolioRes);
      setTrades(tradesRes.trades);
    } catch {
      // Handled
    }
  }, []);

  const selectedPrice = prices[selectedSymbol] || null;
  const selectedHolding = portfolio?.holdings[selectedSymbol] || null;

  return (
    <div className="min-h-screen pt-4 pb-20 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Spot Trading
          </h1>
          <p className="text-sm text-white/50 mt-1">
            {APP_NAME} on-chain trading via Jupiter
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-sm">
            <FaCircle
              className={`text-[8px] ${connected ? "text-green-400" : "text-red-400"}`}
            />
            <span className={connected ? "text-green-400" : "text-red-400"}>
              {connected ? "Connected" : "Offline"}
            </span>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              checkConnection().then(() => fetchAll());
            }}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors"
          >
            <FaSync className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Bot Controls */}
      {connected && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {/* Kill Switch / Enable Bot */}
          <button
            disabled={toggling}
            onClick={async () => {
              const action = tradingEnabled ? "KILL the trading bot" : "ENABLE the trading bot";
              if (!confirm(`Are you sure you want to ${action}?`)) return;
              setToggling(true);
              try {
                const res = await updateConfig({ trading_enabled: !tradingEnabled });
                setTradingEnabled(res.trading_enabled);
              } catch { /* handled */ }
              setToggling(false);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              tradingEnabled
                ? "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"
                : "bg-green-500/20 text-green-300 border-green-500/40 hover:bg-green-500/30"
            } ${toggling ? "opacity-50" : ""}`}
          >
            {tradingEnabled ? "KILL BOT" : "START BOT"}
          </button>

          {/* Paper / Live Toggle */}
          <button
            disabled={toggling}
            onClick={async () => {
              if (dryRun) {
                if (!confirm("Switch to LIVE trading? Real transactions will be executed.")) return;
              }
              setToggling(true);
              try {
                const res = await updateConfig({ dry_run: !dryRun });
                setDryRun(res.dry_run);
              } catch { /* handled */ }
              setToggling(false);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              dryRun
                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40 hover:bg-yellow-500/30"
                : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
            } ${toggling ? "opacity-50" : ""}`}
          >
            {dryRun ? "PAPER" : "LIVE"}
          </button>

          {/* Status badge */}
          <span className={`ml-auto px-3 py-1.5 rounded-lg text-xs font-bold ${
            !tradingEnabled
              ? "bg-slate-500/20 text-slate-400 border border-slate-500/30"
              : dryRun
                ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          }`}>
            {!tradingEnabled ? "BOT OFF" : dryRun ? "PAPER MODE" : "LIVE TRADING"}
          </span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-budju flex items-center gap-2 text-red-400 text-sm"
        >
          <FaExclamationTriangle />
          {error}
          <span className="text-white/40 ml-auto text-xs">
            Make sure the VPS bot is running
          </span>
        </motion.div>
      )}

      {/* Main layout */}
      {connected ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Asset list */}
          <div className="lg:col-span-3">
            <SpotPriceList
              assets={assets}
              onSelect={setSelectedSymbol}
              selectedSymbol={selectedSymbol}
            />
          </div>

          {/* Center: Order form */}
          <div className="lg:col-span-4 space-y-4">
            <SpotOrderForm
              symbol={selectedSymbol}
              price={selectedPrice}
              holding={selectedHolding}
              dryRun={dryRun}
              onTradeComplete={handleTradeComplete}
            />
            <SpotTradeHistory trades={trades} />
          </div>

          {/* Right: Portfolio */}
          <div className="lg:col-span-5">
            <SpotPortfolio portfolio={portfolio} dryRun={dryRun} />
          </div>
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-6xl mb-4 opacity-20">
            <FaExclamationTriangle className="mx-auto" />
          </div>
          <h2 className="text-xl text-white/60 mb-2">VPS Trading Bot Offline</h2>
          <p className="text-white/30 max-w-md mx-auto">
            The trading bot needs to be running on your VPS. Check the setup guide
            to get started.
          </p>
        </div>
      )}
    </div>
  );
};

export default Spot;
