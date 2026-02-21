import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTrophy,
  FaHistory,
  FaChartPie,
  FaWallet,
  FaSync,
  FaCircle,
  FaSignInAlt,
} from "react-icons/fa";
import { APP_NAME } from "@constants/config";
import { useTheme } from "@/context/ThemeContext";
import { useWallet } from "@hooks/useWallet";
import WalletConnect from "@components/common/WalletConnect";
import PortfolioChart from "./components/PortfolioChart";
import HoldingsList from "./components/HoldingsList";
import TradePanel from "./components/TradePanel";
import Leaderboard from "./components/Leaderboard";
import TransactionHistory from "./components/TransactionHistory";
import {
  fetchPortfolio,
  fetchPrices,
  fetchUserPosition,
  clearCache,
  type PortfolioAsset,
  type UserPosition,
} from "./services/tradeApi";

// Admin wallets — matches FLUB config
const ADMIN_WALLETS = [
  "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc",
  "DWUjFtJQtVDu2yPUoQaf3Lhy1SPt6vor5q1i4fqH13Po",
];

const Trade = () => {
  const { isDarkMode } = useTheme();
  const { connection } = useWallet();
  const walletAddress = connection.wallet?.address || "";
  const isConnected = connection.connected && !!walletAddress;
  const isAdmin = isConnected && ADMIN_WALLETS.includes(walletAddress);

  // State
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<"connected" | "connecting" | "error">("connecting");
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [showTradePanel, setShowTradePanel] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [holdingsView, setHoldingsView] = useState<"mine" | "pool">("pool");
  const [refreshKey, setRefreshKey] = useState(0);

  // Computed
  const totalPoolValue = assets.reduce((s, a) => s + a.usdValue, 0);
  const usdcBalance = 0; // USDC balance comes from portfolio data
  const userValue = userPosition
    ? userPosition.currentValue
    : totalPoolValue * ((userPosition?.allocation || 0) / 100);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setApiStatus("connecting");
      const [portfolioData, priceData] = await Promise.all([
        fetchPortfolio(),
        fetchPrices(),
      ]);

      // Merge prices into assets
      const merged = portfolioData.map((a) => ({
        ...a,
        priceUsd: priceData[a.code] || a.priceUsd,
        usdValue:
          priceData[a.code] && a.balance > 0
            ? a.balance * priceData[a.code]
            : a.usdValue,
      }));

      setAssets(merged);
      setPrices(priceData);
      setApiStatus("connected");

      if (isConnected && !isAdmin) {
        const pos = await fetchUserPosition(walletAddress);
        setUserPosition(pos);
      }
    } catch (err) {
      console.error("Failed to load trade data:", err);
      setApiStatus("error");
    } finally {
      setLoading(false);
    }
  }, [isConnected, isAdmin, walletAddress]);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Trading Board - ${APP_NAME}`;
    loadData();
  }, [loadData, refreshKey]);

  // Auto-refresh prices every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPrices().then((p) => {
        setPrices(p);
        setAssets((prev) =>
          prev.map((a) => ({
            ...a,
            priceUsd: p[a.code] || a.priceUsd,
            usdValue: p[a.code] && a.balance > 0 ? a.balance * p[a.code] : a.usdValue,
          })),
        );
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    clearCache();
    setRefreshKey((k) => k + 1);
  };

  const handleSelectAsset = (code: string) => {
    setSelectedAsset(code);
    if (isAdmin) setShowTradePanel(true);
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-24">
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1
              className={`text-2xl md:text-3xl font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              Trading{" "}
              <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
                Board
              </span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <FaCircle
                size={6}
                className={
                  apiStatus === "connected"
                    ? "text-green-400"
                    : apiStatus === "connecting"
                      ? "text-yellow-400 animate-pulse"
                      : "text-red-400"
                }
              />
              <span
                className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                {apiStatus === "connected"
                  ? "Live"
                  : apiStatus === "connecting"
                    ? "Connecting..."
                    : "Offline"}
              </span>
              {isAdmin && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-400 font-bold">
                  ADMIN
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className={`p-2 rounded-lg transition-colors ${isDarkMode ? "text-gray-500 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
              title="Refresh data"
            >
              <FaSync size={12} />
            </button>
            <WalletConnect />
          </div>
        </div>

        {/* ── Not connected state ─────────────────────── */}
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`text-center py-16 rounded-2xl border ${isDarkMode ? "bg-[#0c0c20]/40 border-white/[0.06]" : "bg-white/40 border-gray-200/40"}`}
          >
            <FaWallet
              className={`mx-auto mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
              size={32}
            />
            <h2
              className={`text-lg font-bold mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              Connect Your Wallet
            </h2>
            <p
              className={`text-sm mb-6 max-w-sm mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
            >
              Connect your Phantom or Solflare wallet to view the BUDJU trading
              pool, your holdings, and the leaderboard.
            </p>
            <WalletConnect />

            {/* Still show portfolio chart for visitors */}
            {assets.length > 0 && (
              <div className="mt-8 max-w-md mx-auto">
                <PortfolioChart
                  assets={assets}
                  totalValue={totalPoolValue}
                  usdcBalance={usdcBalance}
                  label="Pool Overview"
                  subtitle="Connect wallet for full access"
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ── Connected state ─────────────────────────── */}
        {isConnected && (
          <>
            {/* Quick actions */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setShowLeaderboard(true)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? "bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.08]" : "bg-white/60 border border-gray-200/40 text-gray-500 hover:text-gray-700"}`}
              >
                <FaTrophy size={10} className="text-yellow-400" /> Leaderboard
              </button>
              <button
                onClick={() => setShowTransactions(true)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? "bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.08]" : "bg-white/60 border border-gray-200/40 text-gray-500 hover:text-gray-700"}`}
              >
                <FaHistory size={10} /> Transactions
              </button>
              {!isAdmin && userPosition && (
                <div
                  className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-xl text-xs ${isDarkMode ? "bg-white/[0.04] border border-white/[0.06]" : "bg-white/60 border border-gray-200/40"}`}
                >
                  <span
                    className={isDarkMode ? "text-gray-500" : "text-gray-400"}
                  >
                    Your share:
                  </span>
                  <span
                    className={`font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {userPosition.allocation.toFixed(1)}%
                  </span>
                  <span
                    className={`font-bold ${userPosition.pnlPercent >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    ({userPosition.pnlPercent >= 0 ? "+" : ""}
                    {userPosition.pnlPercent.toFixed(1)}% P&L)
                  </span>
                </div>
              )}
            </div>

            {/* Loading */}
            {loading && (
              <div
                className={`text-center py-16 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                <div className="w-8 h-8 mx-auto mb-3 rounded-full border-2 border-budju-pink border-t-transparent animate-spin" />
                Loading trading data...
              </div>
            )}

            {/* Main layout */}
            {!loading && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Chart + User info */}
                <div className="lg:col-span-1 space-y-4">
                  <PortfolioChart
                    assets={assets}
                    totalValue={
                      holdingsView === "mine" && !isAdmin
                        ? userValue
                        : totalPoolValue
                    }
                    usdcBalance={usdcBalance}
                    label={
                      holdingsView === "mine" && !isAdmin
                        ? "My Portfolio"
                        : isAdmin
                          ? "Pool Total"
                          : "Pool Overview"
                    }
                    subtitle={
                      holdingsView === "mine" && !isAdmin && userPosition
                        ? `${userPosition.allocation.toFixed(1)}% of pool`
                        : undefined
                    }
                  />

                  {/* User stats card */}
                  {!isAdmin && userPosition && (
                    <div
                      className={`rounded-xl border p-4 ${isDarkMode ? "bg-[#0c0c20]/60 border-white/[0.06]" : "bg-white/60 border-gray-200/40"} backdrop-blur-sm`}
                    >
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div
                            className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            Value
                          </div>
                          <div
                            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            $
                            {userPosition.currentValue.toLocaleString(
                              undefined,
                              { maximumFractionDigits: 2 },
                            )}
                          </div>
                        </div>
                        <div>
                          <div
                            className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            P&L
                          </div>
                          <div
                            className={`text-sm font-bold ${userPosition.pnl >= 0 ? "text-green-400" : "text-red-400"}`}
                          >
                            {userPosition.pnl >= 0 ? "+" : ""}$
                            {userPosition.pnl.toFixed(2)} (
                            {userPosition.pnlPercent.toFixed(1)}%)
                          </div>
                        </div>
                        <div>
                          <div
                            className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            Deposited
                          </div>
                          <div
                            className={`text-sm font-bold font-mono ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                          >
                            $
                            {userPosition.totalDeposited.toLocaleString(
                              undefined,
                              { maximumFractionDigits: 2 },
                            )}
                          </div>
                        </div>
                        <div>
                          <div
                            className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            Pool Share
                          </div>
                          <div
                            className={`text-sm font-bold font-mono ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                          >
                            {userPosition.allocation.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin stats */}
                  {isAdmin && (
                    <div
                      className={`rounded-xl border p-4 ${isDarkMode ? "bg-[#0c0c20]/60 border-white/[0.06]" : "bg-white/60 border-gray-200/40"} backdrop-blur-sm`}
                    >
                      <div
                        className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-amber-400/60" : "text-amber-600/60"}`}
                      >
                        Admin Panel
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div
                            className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            Pool Value
                          </div>
                          <div
                            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            $
                            {totalPoolValue.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </div>
                        </div>
                        <div>
                          <div
                            className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            Assets
                          </div>
                          <div
                            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            {assets.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Holdings + Trade */}
                <div className="lg:col-span-2 space-y-4">
                  {/* Trade panel (admin only, when open) */}
                  <AnimatePresence>
                    {showTradePanel && isAdmin && selectedAsset && (
                      <div className="relative">
                        <TradePanel
                          assets={assets}
                          prices={prices}
                          selectedAsset={selectedAsset}
                          usdcBalance={usdcBalance}
                          onSelectAsset={setSelectedAsset}
                          isAdmin={isAdmin}
                          onClose={() => setShowTradePanel(false)}
                        />
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Holdings */}
                  <div
                    className={`rounded-xl border p-4 ${isDarkMode ? "bg-[#0c0c20]/60 border-white/[0.06]" : "bg-white/60 border-gray-200/40"} backdrop-blur-sm`}
                  >
                    <HoldingsList
                      assets={assets}
                      prices={prices}
                      onSelectAsset={handleSelectAsset}
                      selectedAsset={selectedAsset}
                      isAdmin={isAdmin}
                      userAllocation={userPosition?.allocation || 0}
                      viewMode={isAdmin ? "pool" : holdingsView}
                      onToggleView={
                        isAdmin ? undefined : setHoldingsView
                      }
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Overlays */}
      <Leaderboard
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
      />
      <TransactionHistory
        isOpen={showTransactions}
        onClose={() => setShowTransactions(false)}
        walletAddress={isAdmin ? undefined : walletAddress}
      />
    </main>
  );
};

export default Trade;
