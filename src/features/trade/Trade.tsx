import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTrophy,
  FaHistory,
  FaHome,
  FaSync,
  FaRobot,
  FaUsers,
  FaMoneyBillWave,
  FaChartLine,
  FaExchangeAlt,
  FaPercentage,
  FaWallet,
  FaArrowUp,
  FaArrowDown,
} from "react-icons/fa";
import { APP_NAME } from "@constants/config";
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
  fetchChanges,
  fetchCashBalances,
  fetchAdminStats,
  fetchUserPosition,
  fetchTraderState,
  clearCache,
  type PortfolioAsset,
  type AdminStats,
  type UserPosition,
  type TraderState,
} from "./services/tradeApi";

// Admin wallets — matches FLUB config
const ADMIN_WALLETS = [
  "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc",
  "DWUjFtJQtVDu2yPUoQaf3Lhy1SPt6vor5q1i4fqH13Po",
];

const Trade = () => {
  const { connection } = useWallet();
  const walletAddress = connection.wallet?.address || "";
  const isConnected = connection.connected && !!walletAddress;
  const isAdmin = isConnected && ADMIN_WALLETS.includes(walletAddress);

  // Data state
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [audBalance, setAudBalance] = useState(0);
  const [poolStats, setPoolStats] = useState<AdminStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [traderState, setTraderState] = useState<TraderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<
    "connected" | "connecting" | "error"
  >("connecting");

  // UI state
  const [selectedAsset, setSelectedAsset] = useState("");
  const [showTradePanel, setShowTradePanel] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [holdingsView, setHoldingsView] = useState<"mine" | "pool">("pool");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeNav, setActiveNav] = useState<"leaders" | "home" | "activity">(
    "home",
  );

  // Computed
  const totalPoolValue = assets.reduce((s, a) => s + a.usdValue, 0);
  const userValue = userPosition ? userPosition.currentValue : 0;

  // ── Load data (all public — no wallet needed) ──
  const loadData = useCallback(async () => {
    try {
      setApiStatus("connecting");

      // Public data: portfolio, prices, cash balances, pool stats from MongoDB
      const [portfolioData, priceData, changeData, cashData, statsData] =
        await Promise.all([
          fetchPortfolio(),
          fetchPrices(),
          fetchChanges(),
          fetchCashBalances(),
          fetchAdminStats(),
        ]);

      setPrices(priceData);
      setUsdcBalance(cashData.usdc);
      setAudBalance(cashData.aud);
      setPoolStats(statsData);

      // Merge prices + changes into assets
      const merged = portfolioData.map((a) => ({
        ...a,
        priceUsd: priceData[a.code] || a.priceUsd,
        change24h: changeData[a.code] || a.change24h,
        usdValue:
          priceData[a.code] && a.balance > 0
            ? a.balance * priceData[a.code]
            : a.usdValue,
      }));

      setAssets(merged);

      // Admin-specific: trader state from MongoDB
      if (isAdmin) {
        const state = await fetchTraderState(walletAddress);
        setTraderState(state);
      }

      // Connected user: personal position
      if (isConnected && !isAdmin) {
        const pos = await fetchUserPosition(walletAddress);
        setUserPosition(pos);
      }

      setApiStatus("connected");
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
      Promise.all([fetchPrices(), fetchChanges()]).then(([p, c]) => {
        setPrices(p);
        setAssets((prev) =>
          prev.map((a) => ({
            ...a,
            priceUsd: p[a.code] || a.priceUsd,
            change24h: c[a.code] || a.change24h,
            usdValue:
              p[a.code] && a.balance > 0
                ? a.balance * p[a.code]
                : a.usdValue,
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

  const handleNavClick = (nav: "leaders" | "home" | "activity") => {
    if (nav === "leaders") {
      setShowLeaderboard(true);
      setShowTransactions(false);
    } else if (nav === "activity") {
      setShowTransactions(true);
      setShowLeaderboard(false);
    } else {
      setShowLeaderboard(false);
      setShowTransactions(false);
    }
    setActiveNav(nav);
  };

  const formatUsd = (n: number) =>
    n >= 1000
      ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `$${n.toFixed(2)}`;

  return (
    <main className="min-h-screen">
      {/* ─── App Container (mobile-first, centered) ─── */}
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col px-4 pt-20 pb-4">
        {/* ─── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
            {/* API Status Dot */}
            <div className="relative flex items-center">
              <span
                className={`w-2 h-2 rounded-full ${
                  apiStatus === "connected"
                    ? "bg-green-400"
                    : apiStatus === "connecting"
                      ? "bg-yellow-400 animate-pulse"
                      : "bg-red-400"
                }`}
              />
              {apiStatus === "connected" && (
                <span className="absolute w-2 h-2 rounded-full bg-green-400 animate-ping opacity-50" />
              )}
            </div>
            <span className="text-xs font-medium text-slate-400">
              {apiStatus === "connected"
                ? "Connected"
                : apiStatus === "connecting"
                  ? "Connecting..."
                  : "Disconnected"}
            </span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold">
              v2.0
            </span>
            {isAdmin && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                ADMIN
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
              title="Refresh"
            >
              <FaSync size={12} />
            </button>
            <WalletConnect size="sm" />
          </div>
        </div>

        {/* ─── Main Content ───────────────────────── */}
        <div className="flex-1 pb-20">
          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
              <span className="text-sm text-slate-500">
                Loading trading data...
              </span>
            </div>
          )}

          {/* Main Dashboard */}
          {!loading && (
            <div className="space-y-4">
              {/* ─── Portfolio Chart (public) ────── */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                <PortfolioChart
                  assets={assets}
                  totalValue={
                    holdingsView === "mine" && isConnected && !isAdmin
                      ? userValue
                      : totalPoolValue
                  }
                  usdcBalance={usdcBalance}
                  label={
                    holdingsView === "mine" && isConnected && !isAdmin
                      ? "My Portfolio"
                      : "Pool Overview"
                  }
                  subtitle={
                    holdingsView === "mine" && isConnected && !isAdmin && userPosition
                      ? `${userPosition.allocation.toFixed(1)}% of pool`
                      : `${assets.length} assets`
                  }
                />

                {/* Mine/Pool toggle — only for connected non-admin users */}
                {isConnected && !isAdmin && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      onClick={() => setHoldingsView("pool")}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        holdingsView === "pool"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Pool
                    </button>
                    <button
                      onClick={() => setHoldingsView("mine")}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                        holdingsView === "mine"
                          ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Mine
                    </button>
                  </div>
                )}
              </div>

              {/* ─── Pool Stats (public — visible to everyone) ── */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FaChartLine className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">
                    Pool Stats
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      label: "Users",
                      value: poolStats?.userCount ?? "—",
                      icon: FaUsers,
                      color: "text-blue-400",
                    },
                    {
                      label: "Pool Value",
                      value:
                        poolStats?.poolValue
                          ? formatUsd(poolStats.poolValue)
                          : totalPoolValue > 0
                            ? formatUsd(totalPoolValue)
                            : "—",
                      icon: FaWallet,
                      color: "text-emerald-400",
                    },
                    {
                      label: "NAV",
                      value: poolStats?.nav
                        ? poolStats.nav.toFixed(4)
                        : "—",
                      icon: FaChartLine,
                      color: "text-cyan-400",
                    },
                    {
                      label: "Deposited",
                      value: poolStats?.totalDeposits
                        ? formatUsd(poolStats.totalDeposits)
                        : "—",
                      icon: FaMoneyBillWave,
                      color: "text-green-400",
                    },
                    {
                      label: "Trades",
                      value: poolStats?.tradeCount ?? "—",
                      icon: FaExchangeAlt,
                      color: "text-purple-400",
                    },
                    {
                      label: "P&L",
                      value: poolStats?.pnlPercent
                        ? `${poolStats.pnlPercent >= 0 ? "+" : ""}${poolStats.pnlPercent.toFixed(1)}%`
                        : "—",
                      icon: FaPercentage,
                      color:
                        (poolStats?.pnlPercent || 0) >= 0
                          ? "text-green-400"
                          : "text-red-400",
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl bg-slate-800/40 p-2.5 text-center"
                    >
                      <stat.icon
                        className={`w-3 h-3 mx-auto mb-1 ${stat.color} opacity-60`}
                      />
                      <div className="text-[10px] text-slate-500 mb-0.5">
                        {stat.label}
                      </div>
                      <div
                        className={`text-xs font-bold font-mono ${stat.color}`}
                      >
                        {stat.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ─── Admin Controls (admin-only) ── */}
              {isAdmin && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FaRobot className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
                      Admin Controls
                    </span>
                  </div>

                  {/* Cash Balances */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="rounded-xl bg-slate-800/40 p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        USDC
                      </div>
                      <div className="text-sm font-bold text-green-400 font-mono">
                        ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-800/40 p-3">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                        AUD
                      </div>
                      <div className="text-sm font-bold text-blue-400 font-mono">
                        ${audBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Quick trade buttons */}
                  <div className="flex gap-2">
                    {["Instant", "Trigger", "Auto"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => {
                          if (assets.length > 0) {
                            setSelectedAsset(assets[0].code);
                            setShowTradePanel(true);
                          }
                        }}
                        className="flex-1 py-2 rounded-xl text-[11px] font-bold bg-slate-800/60 border border-slate-700/40 text-slate-400 hover:text-white hover:border-blue-500/30 transition-all"
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── User Position (connected users only) ── */}
              {isConnected && !isAdmin && userPosition && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FaWallet className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">
                      Your Position
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Value
                      </div>
                      <div className="text-base font-bold text-white font-mono">
                        {formatUsd(userPosition.currentValue)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                        P&L
                      </div>
                      <div
                        className={`text-base font-bold font-mono flex items-center gap-1 ${
                          userPosition.pnl >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {userPosition.pnl >= 0 ? (
                          <FaArrowUp size={10} />
                        ) : (
                          <FaArrowDown size={10} />
                        )}
                        {formatUsd(Math.abs(userPosition.pnl))} (
                        {userPosition.pnlPercent.toFixed(1)}%)
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Deposited
                      </div>
                      <div className="text-sm font-bold text-slate-300 font-mono">
                        {formatUsd(userPosition.totalDeposited)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Pool Share
                      </div>
                      <div className="text-sm font-bold text-slate-300 font-mono">
                        {userPosition.allocation.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Trade Panel (Admin, slide-in) ─── */}
              <AnimatePresence>
                {showTradePanel && isAdmin && selectedAsset && (
                  <motion.div
                    initial={{ opacity: 0, x: "100%" }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: "100%" }}
                    transition={{
                      type: "tween",
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  >
                    <TradePanel
                      assets={assets}
                      prices={prices}
                      selectedAsset={selectedAsset}
                      usdcBalance={usdcBalance}
                      onSelectAsset={setSelectedAsset}
                      isAdmin={isAdmin}
                      onClose={() => setShowTradePanel(false)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ─── Holdings (public) ──────────── */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                <HoldingsList
                  assets={assets}
                  prices={prices}
                  onSelectAsset={handleSelectAsset}
                  selectedAsset={selectedAsset}
                  isAdmin={isAdmin}
                  userAllocation={userPosition?.allocation || 0}
                  viewMode={isConnected && !isAdmin ? holdingsView : "pool"}
                  onToggleView={isConnected && !isAdmin ? setHoldingsView : undefined}
                />
              </div>
            </div>
          )}
        </div>

        {/* ─── Bottom Navigation Bar ──────────────── */}
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-2xl mx-auto">
            <div className="mx-3 mb-3 rounded-2xl border border-white/[0.06] bg-[#0f172a]/90 backdrop-blur-xl shadow-lg shadow-black/40">
              <div className="flex items-center justify-around py-2 px-4">
                {/* Leaders */}
                <button
                  onClick={() => handleNavClick("leaders")}
                  className={`flex flex-col items-center gap-1 py-2 px-5 rounded-xl transition-all ${
                    activeNav === "leaders"
                      ? "text-yellow-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <FaTrophy
                    size={16}
                    className={
                      activeNav === "leaders"
                        ? "drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]"
                        : ""
                    }
                  />
                  <span className="text-[10px] font-semibold">Leaders</span>
                </button>

                {/* Home (center, raised) */}
                <button
                  onClick={() => handleNavClick("home")}
                  className="relative -mt-5"
                >
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                      activeNav === "home"
                        ? "bg-gradient-to-br from-blue-500 to-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                        : "bg-slate-800 border border-slate-700/50 hover:border-blue-500/30"
                    }`}
                  >
                    <FaHome
                      size={18}
                      className={
                        activeNav === "home" ? "text-white" : "text-slate-400"
                      }
                    />
                  </div>
                  {activeNav === "home" && (
                    <span className="absolute -bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                  )}
                </button>

                {/* Activity */}
                <button
                  onClick={() => handleNavClick("activity")}
                  className={`flex flex-col items-center gap-1 py-2 px-5 rounded-xl transition-all ${
                    activeNav === "activity"
                      ? "text-blue-400"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <FaHistory
                    size={16}
                    className={
                      activeNav === "activity"
                        ? "drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]"
                        : ""
                    }
                  />
                  <span className="text-[10px] font-semibold">Activity</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Full-page Overlays (public — no wallet needed) ── */}
      <Leaderboard
        isOpen={showLeaderboard}
        onClose={() => {
          setShowLeaderboard(false);
          setActiveNav("home");
        }}
      />
      <TransactionHistory
        isOpen={showTransactions}
        onClose={() => {
          setShowTransactions(false);
          setActiveNav("home");
        }}
        walletAddress={undefined}
      />
    </main>
  );
};

export default Trade;
