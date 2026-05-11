import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useNavigate } from "react-router";
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
import TriggerTradeView from "./components/TriggerTradeView";
import PendingOrdersView from "./components/PendingOrdersView";
import AutoTraderView from "./components/AutoTraderView";
import AdminAutoTradeView from "./components/AdminAutoTradeView";
import RecordDepositView from "./components/RecordDepositView";
import RecordWithdrawalView from "./components/RecordWithdrawalView";
import { lazy } from "react";
const TradeDashboard = lazy(() => import("./TradeDashboard"));
import Leaderboard from "./components/Leaderboard";
import TransactionHistory from "./components/TransactionHistory";
import {
  fetchPortfolio,
  fetchPrices,
  fetchChanges,
  fetchCashBalances,
  fetchAdminStats,
  fetchUserPosition,
  fetchLeaderboard,
  fetchTraderState,
  fetchEnrichedPendingOrders,
  registerWallet,
  recalibratePool,
  clearCache,
  AUD_TO_USD,
  type PortfolioAsset,
  type AdminStats,
  type UserPosition,
  type LeaderboardEntry,
  type TraderState,
} from "./services/tradeApi";
import { getAutoTrader, destroyAutoTrader } from "./services/autoTrader";
import { getActivityLog } from "./services/activityLog";
import { useLivePrices } from "@hooks/useLivePrices";
import ActivityLog from "./components/ActivityLog";

const Trade = () => {
  const navigate = useNavigate();
  const { connection } = useWallet();
  const walletAddress = connection.wallet?.address || "";
  const isConnected = connection.connected && !!walletAddress;
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const isAdmin = isConnected && userRole === "admin";

  // Data state
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [audBalance, setAudBalance] = useState(0);
  const [poolStats, setPoolStats] = useState<AdminStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [traderState, setTraderState] = useState<TraderState | null>(null);
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
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
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [showAutoTrader, setShowAutoTrader] = useState(false);
  const [showAutoAdmin, setShowAutoAdmin] = useState(false);
  const [showTriggerView, setShowTriggerView] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [showHighRisk, setShowHighRisk] = useState(false);
  const [showDepositBreakdown, setShowDepositBreakdown] = useState(false);
  const [depositBreakdown, setDepositBreakdown] = useState<LeaderboardEntry[]>([]);
  const [activeNav, setActiveNav] = useState<"leaders" | "home" | "activity">(
    "home",
  );
  const [, forceUpdate] = useState(0);
  const autoTraderRef = useRef(getAutoTrader());
  const autoTrader = autoTraderRef.current;
  const activityLog = getActivityLog();


  // Fetch user role from server when wallet connects
  useEffect(() => {
    if (!isConnected || !walletAddress) {
      setUserRole(null);
      return;
    }
    registerWallet(walletAddress).then((data) => {
      if (data?.role) setUserRole(data.role);
    });
  }, [isConnected, walletAddress]);


  // ── Real-time Binance WebSocket prices ──
  const { prices: wsPrices, wsState } = useLivePrices(1000);

  // Merge WS prices into assets & prices state whenever they update
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0) return;

    // Update prices state (WS overrides CoinGecko for speed)
    setPrices((prev) => ({ ...prev, ...wsPrices }));

    // Update asset USD values with live prices
    setAssets((prev) =>
      prev.map((a) => {
        const livePrice = wsPrices[a.code];
        if (livePrice && a.balance > 0) {
          return { ...a, priceUsd: livePrice, usdValue: a.balance * livePrice };
        }
        return a;
      }),
    );

    // Feed to AutoTrader
    autoTrader.updatePrices(wsPrices);
  }, [wsPrices, autoTrader]);

  // Computed – pool value includes crypto + cash (USDC already in USD, AUD converted)
  const totalPoolValue = assets.reduce((s, a) => s + a.usdValue, 0) + usdcBalance + audBalance * AUD_TO_USD;
  // Derive user value from LIVE pool value × their share allocation, not a stale server snapshot.
  // Server returns allocation% = (userShares / totalShares) × 100, which stays valid as long as
  // no new deposits/withdrawals occur. This keeps the user value accurate as prices update.
  const userValue = userPosition
    ? totalPoolValue * (userPosition.allocation / 100)
    : 0;

  // ── Load data (all public — no wallet needed) ──
  const loadData = useCallback(async () => {
    try {
      setApiStatus("connecting");
      activityLog.log("Connecting to exchange and price feeds...", "info");

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

      // Enrich changes with Swyftx fallback so auto-trader always has data
      const enrichedChanges = { ...changeData };
      for (const a of merged) {
        if (a.change24h && enrichedChanges[a.code] === undefined) {
          enrichedChanges[a.code] = a.change24h;
        }
      }
      setChanges(enrichedChanges);

      // Calculate pool value for MongoDB queries (crypto + cash)
      const poolVal = merged.reduce((s, a) => s + a.usdValue, 0) + cashData.usdc + cashData.aud * AUD_TO_USD;

      // Fetch pool stats for ALL visitors (public data)
      if (poolVal > 0) {
        const stats = await fetchAdminStats(poolVal);
        setPoolStats(stats);
      }

      // Fetch trader state for insight cards (bot status, tier config)
      const ts = await fetchTraderState();
      setTraderState(ts);

      // Fetch live pending order count from Swyftx (not stale MongoDB data)
      try {
        const liveOrders = await fetchEnrichedPendingOrders(priceData);
        setPendingOrderCount(liveOrders.length);
      } catch {
        setPendingOrderCount(0);
      }

      // Fetch user position if connected (non-admin)
      if (isConnected && !isAdmin && poolVal > 0) {
        const pos = await fetchUserPosition(walletAddress, poolVal);
        setUserPosition(pos);
      }

      activityLog.log("Connected — all data loaded", "success");
      setApiStatus("connected");
    } catch (err) {
      activityLog.log(`Connection error: ${err}`, "error");
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

  // CoinGecko fallback: refresh 24h changes & coins not on Binance every 60s
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([fetchPrices(), fetchChanges()]).then(([p, c]) => {
        // Only update prices for coins NOT covered by WebSocket
        setPrices((prev) => {
          const merged = { ...prev };
          for (const [code, price] of Object.entries(p)) {
            if (!wsPrices[code]) merged[code] = price;
          }
          return merged;
        });
        setChanges(c);
        setAssets((prev) =>
          prev.map((a) => ({
            ...a,
            change24h: c[a.code] || a.change24h,
            // Only update price from CoinGecko if WS doesn't cover this coin
            ...(wsPrices[a.code]
              ? {}
              : {
                  priceUsd: p[a.code] || a.priceUsd,
                  usdValue:
                    p[a.code] && a.balance > 0
                      ? a.balance * p[a.code]
                      : a.usdValue,
                }),
          })),
        );
        // Feed non-WS prices to AutoTrader
        const nonWs: Record<string, number> = {};
        for (const [code, price] of Object.entries(p)) {
          if (!wsPrices[code]) nonWs[code] = price;
        }
        if (Object.keys(nonWs).length > 0) autoTrader.updatePrices(nonWs);
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoTrader, wsPrices]);

  // Initialize AutoTrader for admin users
  useEffect(() => {
    if (!isAdmin || !walletAddress) return;

    autoTrader.setAdminWallet(walletAddress);
    autoTrader.setLogger((msg, level) => {
      activityLog.log(`[AutoTrader] ${msg}`, level === "success" ? "success" : level === "error" ? "error" : "info");
    });
    autoTrader.setOnStateChange(() => {
      forceUpdate((n) => n + 1);
    });

    // Load state from server and potentially resume monitoring
    autoTrader.loadFromServer();

    // Flush any pending debounced tier settings save before page unload
    const handleBeforeUnload = () => {
      autoTrader.flushPendingSave();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Don't destroy autoTrader on unmount — monitoring must continue
    // even when the user navigates away from the Trading page.
    // Only detach UI callbacks so we don't update unmounted components.
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      autoTrader.setOnStateChange(() => {});
      autoTrader.setLogger(() => {});
    };
  }, [isAdmin, walletAddress, autoTrader]);

  const handleRefresh = () => {
    clearCache();
    setRefreshKey((k) => k + 1);
  };

  const handleSelectAsset = (code: string) => {
    setSelectedAsset(code);
    if (isAdmin) {
      setShowTradePanel(true);
      setShowTriggerView(false);
      setShowAutoAdmin(false);
      setShowDeposit(false);
      // Scroll to top so the trade panel is visible
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${
              wsState.connected
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/15 text-amber-400 border-amber-500/20 animate-pulse"
            }`}>
              {wsState.connected
                ? `WS LIVE ${wsState.priceCount > 0 ? `(${wsState.priceCount})` : ""}`
                : "WS ..."}
            </span>
            {showHighRisk && (
              <button
                onClick={() => setShowHighRisk(false)}
                className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border bg-slate-500/15 text-slate-400 border-slate-500/20 hover:bg-red-500/15 hover:text-red-300 hover:border-red-500/20 transition-all"
              >
                ✕ Close
              </button>
            )}
            {isAdmin && (
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                ADMIN
                <button
                  onClick={() => navigate("/")}
                  className="text-amber-400 hover:text-white transition-colors ml-0.5"
                  title="Back to home"
                >
                  ✕
                </button>
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
              {/* ─── Portfolio Chart (hidden when any trade view is open) ────── */}
              {!(showAutoAdmin && isAdmin) && !showTriggerView && !showDeposit && !showWithdrawal && !showTradePanel && !showHighRisk && (
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
                    subtitle={`${assets.filter((a) => a.code !== "AUD" && a.code !== "USDC").length} assets + cash`}
                    onSelectAsset={isAdmin ? handleSelectAsset : undefined}
                  />

                  {/* Admin: tap coin to trade / User: connect to join */}
                  <p className="text-center text-xs text-slate-500 mt-3">
                    {isAdmin ? "Tap coin to trade" : !isConnected ? "Connect wallet to join" : ""}
                  </p>

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
              )}

              {/* ─── Trade Buttons + Cash + Stats (PUBLIC - visible to ALL, hidden on perp page) ── */}
              {!showHighRisk && (
              <div className={`rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4 ${(showAutoAdmin || showTriggerView) && isAdmin ? "pb-2" : ""}`}>
                {/* Admin: nav buttons — FLUB-style pills in a dark container (hidden on perp page) */}
                {isAdmin && !showHighRisk && (
                  <div
                    className={`rounded-xl bg-slate-900/60 border border-white/[0.04] p-1.5 overflow-x-auto ${showAutoAdmin || showTriggerView || showDeposit || showWithdrawal || showTradePanel || showHighRisk ? "" : "mb-3"}`}
                    style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                  >
                    <div className="flex gap-1.5" style={{ minWidth: "max-content" }}>
                      {([
                        { key: "instant", label: "Instant", icon: "\u26A1", active: showTradePanel, color: "blue",
                          onClick: () => { if (assets.length > 0) { setSelectedAsset(assets[0].code); setShowTradePanel(true); setShowTriggerView(false); setShowAutoAdmin(false); setShowDeposit(false); setShowWithdrawal(false); setShowHighRisk(false); } } },
                        { key: "trigger", label: "Trigger", icon: "\u2699", active: showTriggerView, color: "amber",
                          onClick: () => { setShowTriggerView(!showTriggerView); setShowTradePanel(false); setShowAutoAdmin(false); setShowDeposit(false); setShowWithdrawal(false); setShowHighRisk(false); } },
                        { key: "auto", label: "Auto", icon: "\u2728", active: showAutoAdmin, color: "emerald",
                          onClick: () => { setShowAutoAdmin(!showAutoAdmin); setShowTradePanel(false); setShowTriggerView(false); setShowDeposit(false); setShowWithdrawal(false); setShowHighRisk(false); } },
                        { key: "deposit", label: "Deposit", icon: "+", active: showDeposit, color: "green",
                          onClick: () => { setShowDeposit(!showDeposit); setShowWithdrawal(false); setShowTradePanel(false); setShowTriggerView(false); setShowAutoAdmin(false); setShowHighRisk(false); } },
                        { key: "withdraw", label: "Withdraw", icon: "-", active: showWithdrawal, color: "red",
                          onClick: () => { setShowWithdrawal(!showWithdrawal); setShowDeposit(false); setShowTradePanel(false); setShowTriggerView(false); setShowAutoAdmin(false); setShowHighRisk(false); } },
                        { key: "highrisk", label: "High Risk", icon: "\uD83D\uDD25", active: showHighRisk, color: "red",
                          onClick: () => { setShowHighRisk(!showHighRisk); setShowTradePanel(false); setShowTriggerView(false); setShowAutoAdmin(false); setShowDeposit(false); setShowWithdrawal(false); } },
                      ] as const).map((btn) => {
                        const colorMap: Record<string, { active: string; inactive: string }> = {
                          blue:    { active: "bg-blue-500/25 text-blue-200 border-blue-400/60 shadow-[0_0_8px_rgba(59,130,246,0.25)]", inactive: "bg-blue-500/8 text-blue-300/70 border-blue-500/25 hover:bg-blue-500/15 hover:text-blue-200 hover:border-blue-400/50" },
                          amber:   { active: "bg-amber-500/25 text-amber-200 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.25)]", inactive: "bg-amber-500/8 text-amber-300/70 border-amber-500/25 hover:bg-amber-500/15 hover:text-amber-200 hover:border-amber-400/50" },
                          emerald: { active: "bg-emerald-500/25 text-emerald-200 border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.25)]", inactive: "bg-emerald-500/8 text-emerald-300/70 border-emerald-500/25 hover:bg-emerald-500/15 hover:text-emerald-200 hover:border-emerald-400/50" },
                          green:   { active: "bg-green-500/25 text-green-200 border-green-400/60 shadow-[0_0_8px_rgba(34,197,94,0.25)]", inactive: "bg-green-500/8 text-green-300/70 border-green-500/25 hover:bg-green-500/15 hover:text-green-200 hover:border-green-400/50" },
                          red:     { active: "bg-red-500/25 text-red-200 border-red-400/60 shadow-[0_0_8px_rgba(239,68,68,0.25)]", inactive: "bg-red-500/8 text-red-300/70 border-red-500/25 hover:bg-red-500/15 hover:text-red-200 hover:border-red-400/50" },
                        };
                        const colors = colorMap[btn.color] || colorMap.blue;
                        return (
                          <button
                            key={btn.key}
                            onClick={btn.onClick}
                            className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap ${
                              btn.active ? colors.active : colors.inactive
                            }`}
                          >
                            {btn.icon} {btn.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Non-admin: 3 insight cards (Orders / Auto Trader / Live Charts) */}
                {!isAdmin && (
                  <div className="space-y-2 mb-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowTriggerView(!showTriggerView)}
                        className="flex-1 flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:scale-[1.02] hover:brightness-125"
                        style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)" }}
                      >
                        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(168,85,247,0.15)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div className="text-left">
                          <div className="text-[11px] font-bold text-slate-300">Orders</div>
                          <div className="text-[10px] font-bold text-purple-400">
                            {pendingOrderCount > 0
                              ? `${pendingOrderCount} pending`
                              : "None"}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setShowAutoTrader(true)}
                        className="flex-1 flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:scale-[1.02] hover:brightness-125"
                        style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
                      >
                        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.15)" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                            <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                        </div>
                        <div className="text-left">
                          <div className="text-[11px] font-bold text-slate-300">Auto Trader</div>
                          <div className="text-[10px] font-bold" style={{ color: traderState?.autoBotActive ? "#22c55e" : "#64748b" }}>
                            {traderState?.autoBotActive ? "Active" : "Inactive"}
                          </div>
                        </div>
                      </button>
                    </div>
                    {/* Live Charts button — opens read-only dashboard */}
                    <button
                      onClick={() => { setShowHighRisk(!showHighRisk); setShowTriggerView(false); }}
                      className="w-full flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:scale-[1.01] hover:brightness-125"
                      style={{
                        background: showHighRisk ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${showHighRisk ? "rgba(239,68,68,0.4)" : "rgba(239,68,68,0.2)"}`,
                      }}
                    >
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)" }}>
                        <span className="text-sm">📈</span>
                      </div>
                      <div className="text-left flex-1">
                        <div className="text-[11px] font-bold text-slate-300">Live Charts + AI Predictions</div>
                        <div className="text-[10px] font-bold text-red-400">
                          6 markets • Real-time
                        </div>
                      </div>
                      <span className="text-[9px] bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-mono border border-blue-500/20">
                        NEW
                      </span>
                    </button>
                  </div>
                )}

                {/* USDC Balance + Crypto/USDC Ratio Meter — visible to all, hidden when trade views open */}
                {!(showAutoAdmin && isAdmin) && !showTriggerView && !showDeposit && !showWithdrawal && !showTradePanel && !showHighRisk && (() => {
                  const cryptoValue = assets.reduce((s, a) => s + a.usdValue, 0);
                  const totalVal = cryptoValue + usdcBalance;
                  const cryptoPct = totalVal > 0 ? Math.round((cryptoValue / totalVal) * 100) : 0;
                  const usdcPct = totalVal > 0 ? 100 - cryptoPct : 0;
                  return (
                    <div className="mb-3 rounded-xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm px-4 py-3">
                      {/* USDC balance row */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-green-400">$</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-300">USDC Balance</span>
                        </div>
                        <span className="text-sm font-bold text-green-400 font-mono">
                          ${Math.round(usdcBalance).toLocaleString()}
                        </span>
                      </div>

                      {/* Ratio meter */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold text-cyan-400">
                            {cryptoPct}% Crypto
                          </span>
                          <span className="text-[10px] font-semibold text-green-400">
                            {usdcPct}% USDC
                          </span>
                        </div>
                        <div className="relative h-2.5 rounded-full overflow-hidden bg-slate-800/80 border border-white/[0.04]">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                            style={{
                              width: `${cryptoPct}%`,
                              background: "linear-gradient(90deg, #06b6d4, #8b5cf6)",
                            }}
                          />
                          <div
                            className="absolute inset-y-0 right-0 rounded-full transition-all duration-500"
                            style={{
                              width: `${usdcPct}%`,
                              background: "linear-gradient(90deg, #22c55e, #4ade80)",
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-slate-500 font-mono">
                            ${Math.round(cryptoValue).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            ${Math.round(usdcBalance).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Cash Balances + Admin Balance — hidden when any trade view is open */}
                {!(showAutoAdmin && isAdmin) && !showTriggerView && !showDeposit && !showWithdrawal && !showTradePanel && !showHighRisk && isAdmin && (
                  <div className="flex items-center justify-center gap-3 mb-3 py-1.5 rounded-xl bg-slate-800/30">
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-[10px] text-slate-400">USDC</span>
                      <span className="text-[10px] font-bold text-green-400 font-mono">
                        ${Math.round(usdcBalance).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      <span className="text-[10px] text-slate-400">AUD</span>
                      <span className="text-[10px] font-bold text-amber-400 font-mono">
                        ${Math.round(audBalance).toLocaleString()}
                      </span>
                    </div>
                    <div className="w-px h-3 bg-slate-700/50" />
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="text-[10px] text-slate-400">Admin</span>
                      <span className="text-[10px] font-bold text-cyan-400 font-mono">
                        ${Math.round(totalPoolValue - (poolStats?.totalUserValue || 0)).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Pool Stats Grid - admin only, hidden when any trade view is open */}
                {!((showAutoAdmin || showTriggerView || showDeposit || showWithdrawal || showTradePanel || showHighRisk) && isAdmin) && poolStats && (
                  <>
                    {isAdmin && (
                    <>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {([
                        { label: "USERS", value: poolStats.userCount, icon: HiOutlineUsers, color: "text-blue-400" },
                        { label: "DEPOSITED", value: formatUsd(poolStats.totalUserDeposited), icon: HiOutlineBanknotes, color: "text-green-400",
                          onClick: isAdmin ? async () => {
                            if (showDepositBreakdown) { setShowDepositBreakdown(false); return; }
                            const lb = await fetchLeaderboard(totalPoolValue);
                            setDepositBreakdown(lb.filter((u) => u.totalDeposited > 0));
                            setShowDepositBreakdown(true);
                          } : undefined },
                        { label: "USER VALUE", value: formatUsd(poolStats.totalUserValue), icon: HiOutlineChartBar, color: "text-cyan-400" },
                        { label: "NAV", value: `$${poolStats.nav.toFixed(4)}`, icon: HiOutlineWallet, color: "text-purple-400" },
                        { label: "TRADES", value: poolStats.tradeCount, icon: HiOutlineArrowsRightLeft, color: "text-emerald-400" },
                        { label: "USER P&L", value: `${poolStats.pnlPercent >= 0 ? "+" : ""}${poolStats.pnlPercent.toFixed(1)}%`, icon: HiOutlineChartBar, color: poolStats.pnlPercent >= 0 ? "text-green-400" : "text-red-400" },
                      ] as { label: string; value: string | number; icon: any; color: string; onClick?: () => void }[]).map((stat) => (
                        <div
                          key={stat.label}
                          onClick={stat.onClick}
                          className={`rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-center ${stat.onClick ? "cursor-pointer hover:border-slate-600/50 active:scale-95 transition-all" : ""}`}
                        >
                          <div className="text-[10px] text-slate-500 font-semibold tracking-wider mb-1">{stat.label}</div>
                          <div className={`text-sm font-bold font-mono ${stat.color}`}>{stat.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Deposit breakdown (admin only) */}
                    <AnimatePresence>
                      {showDepositBreakdown && depositBreakdown.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden mb-2"
                        >
                          <div className="rounded-xl border border-green-500/20 bg-slate-900/60 p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-green-400/70">User Deposits</span>
                              <button onClick={() => setShowDepositBreakdown(false)} className="text-[10px] text-slate-500 hover:text-white">Close</button>
                            </div>
                            <div className="space-y-1.5">
                              {depositBreakdown.map((user) => (
                                <div key={user.walletAddress} className="flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-slate-800/40">
                                  <span className="text-[11px] text-slate-400 font-mono">{user.walletShort}</span>
                                  <span className="text-[11px] font-bold text-green-400 font-mono">{formatUsd(user.totalDeposited)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Pool value footer */}
                    <div className="flex justify-between items-center px-1 pt-1 border-t border-slate-700/20">
                      <span className="text-[10px] text-slate-600 font-mono">
                        DB: {poolStats.userCount}u {poolStats.depositCount}d {poolStats.tradeCount}t pool
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!walletAddress || !totalPoolValue) return;
                            if (!confirm(`Snapshot pool at ${formatUsd(totalPoolValue)}? Each user's deposit resets to their current value. P&L resets to 0%.`)) return;
                            const result = await recalibratePool(walletAddress, totalPoolValue);
                            if (result.success) {
                              alert(`Snapshot done! Admin capital: ${formatUsd(result.adminCapital || 0)}, User value: ${formatUsd(result.totalUserValue || 0)}`);
                              clearCache();
                              loadData();
                            } else {
                              alert(`Error: ${result.error}`);
                            }
                          }}
                          className="text-[9px] text-amber-500/60 hover:text-amber-400 font-mono"
                        >
                          recalibrate
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {formatUsd(totalPoolValue)}
                        </span>
                      </div>
                    </div>
                    </>
                    )}

                    {/* User Position — visible for connected non-admin users */}
                    {isConnected && !isAdmin && userPosition && (
                      <>
                        <div className="flex items-center gap-2 mt-3 mb-2 pt-2 border-t border-slate-700/20">
                          <HiOutlineWallet className="w-3 h-3 text-blue-400" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">
                            Your Position
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Value</div>
                            <div className="text-base font-bold text-white font-mono">{formatUsd(userValue)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">P&L</div>
                            <div className={`text-base font-bold font-mono flex items-center gap-1 ${(userValue - userPosition.totalDeposited) >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {(userValue - userPosition.totalDeposited) >= 0 ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                              {formatUsd(Math.abs(userValue - userPosition.totalDeposited))}
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
                      </>
                    )}
                  </>
                )}
              </div>
              )}

              {/* ─── Trade Panel (admin only) ─── */}
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

              {/* ─── Trigger Trade View (admin: full form + orders, non-admin: orders only) ─── */}
              <AnimatePresence>
                {showTriggerView && (
                  <TriggerTradeView
                    assets={assets}
                    prices={prices}
                    usdcBalance={usdcBalance}
                    isAdmin={isAdmin}
                    walletAddress={walletAddress}
                    onClose={() => setShowTriggerView(false)}
                  />
                )}
              </AnimatePresence>

              {/* ─── Admin Auto Trade View ─── */}
              <AnimatePresence>
                {showAutoAdmin && isAdmin && (
                  <AdminAutoTradeView
                    prices={prices}
                    changes={changes}
                    adminWallet={walletAddress}
                    onClose={() => setShowAutoAdmin(false)}
                    autoTrader={autoTrader}
                    assets={assets}
                  />
                )}
              </AnimatePresence>

              {/* ─── Record Deposit View (admin only) ─── */}
              <AnimatePresence>
                {showDeposit && isAdmin && (
                  <RecordDepositView
                    adminWallet={walletAddress}
                    totalPoolValue={totalPoolValue}
                    poolStats={poolStats}
                    onClose={() => setShowDeposit(false)}
                    onSuccess={handleRefresh}
                  />
                )}

                {showWithdrawal && isAdmin && (
                  <RecordWithdrawalView
                    adminWallet={walletAddress}
                    totalPoolValue={totalPoolValue}
                    poolStats={poolStats}
                    onClose={() => setShowWithdrawal(false)}
                    onSuccess={handleRefresh}
                  />
                )}
              </AnimatePresence>

              {/* ─── High Risk View (new trading dashboard) ─── */}
              {showHighRisk && (
                <Suspense fallback={<div className="flex items-center justify-center py-12"><div className="text-sm text-slate-400 animate-pulse">Loading dashboard...</div></div>}>
                  <TradeDashboard onClose={() => setShowHighRisk(false)} isAdmin={isAdmin} />
                </Suspense>
              )}

              {/* ─── Holdings (hidden when any trade view is open) ── */}
              {!(showAutoAdmin && isAdmin) && !showTriggerView && !showDeposit && !showWithdrawal && !showTradePanel && !showHighRisk && (
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
              )}

              {/* ─── Activity Log (visible to ALL users, hidden on perp page) ──────────── */}
              {!showHighRisk && <ActivityLog />}

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
        walletAddress={walletAddress}
      />
      <PendingOrdersView
        isOpen={showPendingOrders}
        onClose={() => setShowPendingOrders(false)}
        prices={prices}
      />
      <AutoTraderView
        isOpen={showAutoTrader}
        onClose={() => setShowAutoTrader(false)}
        prices={prices}
        changes={changes}
        assets={assets}
      />
    </main>
  );
};

export default Trade;
