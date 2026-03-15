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
  type SpotAsset,
  type SpotPortfolio as SpotPortfolioType,
  type SpotTrade,
  type PriceData,
} from "./services/spotApi";

const Spot = () => {
  const [connected, setConnected] = useState(false);
  const [dryRun, setDryRun] = useState(true);
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

      {/* Dry run banner */}
      {connected && dryRun && (
        <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-budju text-yellow-400 text-sm text-center">
          Paper trading mode — no real transactions. Set DRY_RUN=false on VPS to trade live.
        </div>
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
