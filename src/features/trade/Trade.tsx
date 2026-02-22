import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaSync,
  FaArrowUp,
  FaArrowDown,
} from "react-icons/fa";
import { HiOutlineTrophy, HiOutlineHome, HiOutlineDocumentText } from "react-icons/hi2";
import { HiOutlineUsers, HiOutlineBanknotes, HiOutlineChartBar, HiOutlineArrowsRightLeft, HiOutlineWallet } from "react-icons/hi2";
import { APP_NAME } from "@constants/config";
import { useWallet } from "@hooks/useWallet";
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
  clearCache,
  type PortfolioAsset,
  type AdminStats,
  type UserPosition,
} from "./services/tradeApi";

// Admin wallets
const ADMIN_WALLETS = [
  "AEWvE2xXaHSGdGCaCArb2PWdKS7K9RwoCRV7CT2CJTWq",
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

      // Use allSettled so one failing source never kills the whole page
      const results = await Promise.allSettled([
        fetchPortfolio(),
        fetchPrices(),
        fetchChanges(),
        fetchCashBalances(),
      ]);

      const portfolioData =
        results[0].status === "fulfilled" ? results[0].value : [];
      const priceData =
        results[1].status === "fulfilled" ? results[1].value : {};
      const changeData =
        results[2].status === "fulfilled" ? results[2].value : {};
      const cashData =
        results[3].status === "fulfilled"
          ? results[3].value
          : { usdc: 0, aud: 0 };

      setPrices(priceData);
      setUsdcBalance(cashData.usdc);
      setAudBalance(cashData.aud);

      // Merge CoinGecko USD prices into portfolio assets
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

      // Calculate pool value for MongoDB queries
      const poolVal = merged.reduce((s, a) => s + a.usdValue, 0);

      // Fetch pool stats for ALL visitors (public data)
      if (poolVal > 0) {
        const stats = await fetchAdminStats(poolVal);
        setPoolStats(stats);
      }

      // Fetch user position if connected (non-admin)
      if (isConnected && !isAdmin && poolVal > 0) {
        const pos = await fetchUserPosition(walletAddress, poolVal);
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
      <div className="max-w-2xl mx-auto min-h-screen flex flex-col px-4 pt-20 pb-4">
        {/* ─── Header ─────────────────────────────── */}
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2.5">
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
            {isAdmin && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                ADMIN
              </span>
            )}
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Refresh"
          >
            <FaSync size={12} />
          </button>
        </div>

        {/* ─── Main Content ───────────────────────── */}
        <div className="flex-1 pb-20">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-4" />
              <span className="text-sm text-slate-500">
                Loading trading data...
              </span>
            </div>
          )}

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
                      : "Pool Total"
                  }
                  subtitle={`${assets.length} assets + cash`}
                />

                {/* Admin: Tap coin to trade */}
                {isAdmin && (
                  <p className="text-center text-xs text-slate-500 mt-3">
                    Tap coin to trade
                  </p>
                )}

                {/* Connect wallet to join */}
                {!isConnected && (
                  <p className="text-center text-xs text-slate-500 mt-3">
                    Connect wallet to join
                  </p>
                )}

                {/* Mine/Pool toggle for connected users */}
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

              {/* ─── Trade Buttons + Cash + Stats (PUBLIC - visible to ALL) ── */}
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                {/* Quick trade buttons - visible to all, only functional for admin */}
                <div className="flex gap-2 mb-3">
                  {[
                    { label: "Instant", icon: "\u26A1", color: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400" },
                    { label: "Trigger", icon: "\u2699", color: "from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-400" },
                    { label: "Auto", icon: "\u2728", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400" },
                  ].map((mode) => (
                    <button
                      key={mode.label}
                      onClick={() => {
                        if (isAdmin && assets.length > 0) {
                          setSelectedAsset(assets[0].code);
                          setShowTradePanel(true);
                        }
                      }}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-b border transition-all ${mode.color}`}
                    >
                      {mode.icon} {mode.label}
                    </button>
                  ))}
                </div>

                {/* Cash Balances - visible to all */}
                <div className="flex items-center justify-center gap-6 mb-3 py-2 rounded-xl bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="text-sm text-slate-400">USDC</span>
                    <span className="text-sm font-bold text-green-400 font-mono">
                      ${usdcBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-sm text-slate-400">AUD</span>
                    <span className="text-sm font-bold text-amber-400 font-mono">
                      ${audBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Pool Stats Grid - visible to all */}
                {poolStats && (
                  <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        { label: "USERS", value: poolStats.userCount, icon: HiOutlineUsers, color: "text-blue-400" },
                        { label: "DEPOSITED", value: formatUsd(poolStats.totalUserDeposited), icon: HiOutlineBanknotes, color: "text-green-400" },
                        { label: "USER VALUE", value: formatUsd(poolStats.totalUserValue), icon: HiOutlineChartBar, color: "text-cyan-400" },
                        { label: "NAV", value: `$${poolStats.nav.toFixed(4)}`, icon: HiOutlineWallet, color: "text-purple-400" },
                        { label: "TRADES", value: poolStats.tradeCount, icon: HiOutlineArrowsRightLeft, color: "text-emerald-400" },
                        { label: "USER P&L", value: `${poolStats.pnlPercent >= 0 ? "+" : ""}${poolStats.pnlPercent.toFixed(1)}%`, icon: HiOutlineChartBar, color: poolStats.pnlPercent >= 0 ? "text-green-400" : "text-red-400" },
                      ].map((stat) => (
                        <div key={stat.label} className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-center">
                          <div className="text-[10px] text-slate-500 font-semibold tracking-wider mb-1">{stat.label}</div>
                          <div className={`text-sm font-bold font-mono ${stat.color}`}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Pool value footer */}
                    <div className="flex justify-between items-center px-1 pt-1 border-t border-slate-700/20">
                      <span className="text-[10px] text-slate-600 font-mono">
                        DB: {poolStats.userCount}u {poolStats.depositCount}d {poolStats.tradeCount}t pool
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatUsd(totalPoolValue)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ─── User Position (connected non-admin users) ── */}
              {isConnected && !isAdmin && userPosition && (
                <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <HiOutlineWallet className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">
                      Your Position
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Value</div>
                      <div className="text-base font-bold text-white font-mono">{formatUsd(userPosition.currentValue)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">P&L</div>
                      <div className={`text-base font-bold font-mono flex items-center gap-1 ${(userPosition.currentValue - userPosition.totalDeposited) >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {(userPosition.currentValue - userPosition.totalDeposited) >= 0 ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                        {formatUsd(Math.abs(userPosition.currentValue - userPosition.totalDeposited))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Deposited</div>
                      <div className="text-sm font-bold text-slate-300 font-mono">{formatUsd(userPosition.totalDeposited)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Pool Share</div>
                      <div className="text-sm font-bold text-slate-300 font-mono">{userPosition.allocation.toFixed(2)}%</div>
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
                    transition={{ type: "tween", duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
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
            <div className="mx-3 mb-3 rounded-2xl border border-white/[0.06] bg-[#0f172a]/95 backdrop-blur-xl shadow-lg shadow-black/40">
              <div className="flex items-center justify-around py-2 px-4">
                {/* LEADERS - outline trophy */}
                <button
                  onClick={() => handleNavClick("leaders")}
                  className={`flex flex-col items-center gap-1 py-2 px-5 rounded-xl transition-all ${
                    activeNav === "leaders" ? "text-yellow-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <HiOutlineTrophy
                    size={22}
                    strokeWidth={1.5}
                    style={activeNav === "leaders" ? { filter: "drop-shadow(0 0 6px rgba(250,204,21,0.8)) drop-shadow(0 0 12px rgba(250,204,21,0.4))" } : undefined}
                  />
                  <span className="text-[10px] font-bold tracking-wider">LEADERS</span>
                </button>

                {/* HOME - outline home in circle border */}
                <button onClick={() => handleNavClick("home")} className="relative -mt-5">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 ${
                    activeNav === "home"
                      ? "border-blue-500/60 bg-[#0f172a] shadow-[0_0_20px_rgba(59,130,246,0.4),0_0_40px_rgba(59,130,246,0.15)]"
                      : "border-slate-700/50 bg-[#0f172a] hover:border-blue-500/30"
                  }`}>
                    <HiOutlineHome
                      size={22}
                      strokeWidth={1.5}
                      className={activeNav === "home" ? "text-blue-400" : "text-slate-400"}
                      style={activeNav === "home" ? { filter: "drop-shadow(0 0 6px rgba(59,130,246,0.8))" } : undefined}
                    />
                  </div>
                  <span className={`block text-center text-[10px] font-bold tracking-wider mt-1 ${
                    activeNav === "home" ? "text-blue-400" : "text-slate-500"
                  }`}>HOME</span>
                </button>

                {/* ACTIVITY - outline document icon */}
                <button
                  onClick={() => handleNavClick("activity")}
                  className={`flex flex-col items-center gap-1 py-2 px-5 rounded-xl transition-all ${
                    activeNav === "activity" ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <HiOutlineDocumentText
                    size={22}
                    strokeWidth={1.5}
                    style={activeNav === "activity" ? { filter: "drop-shadow(0 0 6px rgba(59,130,246,0.8)) drop-shadow(0 0 12px rgba(59,130,246,0.4))" } : undefined}
                  />
                  <span className="text-[10px] font-bold tracking-wider">ACTIVITY</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Full-page Overlays ──────────────────── */}
      <Leaderboard
        isOpen={showLeaderboard}
        onClose={() => { setShowLeaderboard(false); setActiveNav("home"); }}
        poolValue={totalPoolValue}
      />
      <TransactionHistory
        isOpen={showTransactions}
        onClose={() => { setShowTransactions(false); setActiveNav("home"); }}
        walletAddress={isConnected ? walletAddress : ADMIN_WALLETS[0]}
      />
    </main>
  );
};

export default Trade;
