import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  FaSync,
} from "react-icons/fa";
import { HiOutlineTrophy, HiOutlineHome, HiOutlineDocumentText } from "react-icons/hi2";
import { APP_NAME } from "@constants/config";
import { useWallet } from "@hooks/useWallet";
import PortfolioChart from "./components/PortfolioChart";
import { LEADERBOARD_PALETTE } from "./components/LeaderboardDoughnut";
import HoldingsList from "./components/HoldingsList";
import TradePanel from "./components/TradePanel";
import TriggerTradeView from "./components/TriggerTradeView";
import PendingOrdersView from "./components/PendingOrdersView";
import AutoTraderView from "./components/AutoTraderView";
import CoinStatsView from "./components/CoinStatsView";
import AdminAutoTradeView from "./components/AdminAutoTradeView";
import PoolPerformanceView from "./components/PoolPerformanceView";
import { lazy } from "react";
const TradeDashboard = lazy(() => import("./TradeDashboard"));
import Leaderboard from "./components/Leaderboard";
import TransactionHistory from "./components/TransactionHistory";
import PersonalTradingView from "./components/PersonalTradingView";
import GrowthAreaChart from "./components/GrowthAreaChart";
import {
  fetchPortfolio,
  fetchPrices,
  fetchChanges,
  fetchCashBalances,
  fetchUserPosition,
  fetchTraderState,
  fetchEnrichedPendingOrders,
  fetchLivePosition,
  fetchPersonalPricedHoldings,
  fetchLiveLeaderboard,
  poolAssetsFromLeaderboard,
  fetchWalletCashFlows,
  fetchCommunityCashFlows,
  buildLiveCashFlowHistory,
  buildCommunityCashFlowHistory,
  registerWallet,
  clearCache,
  AUD_TO_USD,
  type PortfolioAsset,
  type UserPosition,
  type TraderState,
  type LivePosition,
  type LiveLeaderboard,
  type WalletCashFlows,
  type CommunityCashFlows,
} from "./services/tradeApi";
import { getAutoTrader, destroyAutoTrader } from "./services/autoTrader";
import { getActivityLog } from "./services/activityLog";
import { useLivePrices } from "@hooks/useLivePrices";
import ActivityLog from "./components/ActivityLog";

const BUDJU_GATE_REQUIRED = 10_000_000;

const Trade = () => {
  const navigate = useNavigate();
  const { connection, balances } = useWallet();
  const walletAddress = connection.wallet?.address || "";
  const isConnected = connection.connected && !!walletAddress;
  const [userRole, setUserRole] = useState<"admin" | "user" | null>(null);
  const isAdmin = isConnected && userRole === "admin";

  // BUDJU Gate — "My Exchange Key" (non-custodial Swyftx key + auto-trading)
  // is only ever shown to a wallet that actually holds 10M BUDJU. This is a
  // UI-only check (same as everywhere else this gate appears) — the backend
  // re-verifies it server-side before a key can ever be saved. Admin is
  // exempt: the admin wallet is the operator account (it links the server's
  // own already-configured Swyftx key, not a personal holding-gated key) and
  // isn't guaranteed to hold 10M BUDJU itself — same as its exemption from
  // leaderboards/allocations elsewhere in the app.
  const budjuBalance = balances.tokens.find((t) => t.symbol === "BUDJU")?.amount ?? 0;
  const hasBudjuGateAccess = isAdmin || (isConnected && budjuBalance >= BUDJU_GATE_REQUIRED);

  // Data state
  const [assets, setAssets] = useState<PortfolioAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [audBalance, setAudBalance] = useState(0);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [livePosition, setLivePosition] = useState<LivePosition | null>(null);
  // This wallet's own per-coin holdings (non-admin "Mine" view) — real
  // coins from THEIR OWN Swyftx key (e.g. FLR, ARB, CC), not a slice of
  // the pooled master account scaled by a legacy allocation %.
  const [myHoldings, setMyHoldings] = useState<PortfolioAsset[]>([]);
  // Non-custodial combined total across every connected wallet (replaces
  // the legacy pool total as the default "Pool" view everyone sees).
  const [liveLeaderboard, setLiveLeaderboard] = useState<LiveLeaderboard | null>(null);
  // Growth/P&L area chart data for the Pool Total / My Position card — same
  // chart component, just a different data source per view (this wallet's
  // own deposit history vs. the combined timeline across every wallet).
  const [myCashFlows, setMyCashFlows] = useState<WalletCashFlows | null>(null);
  const [communityCashFlows, setCommunityCashFlows] = useState<CommunityCashFlows | null>(null);
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
  const [showPersonalTrading, setShowPersonalTrading] = useState(false);
  const [showAutoAdmin, setShowAutoAdmin] = useState(false);
  const [showTriggerView, setShowTriggerView] = useState(false);
  const [showHighRisk, setShowHighRisk] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);
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
  // This remains the admin's OWN Swyftx account value (what "tap a coin to
  // trade" acts on) — it is NOT the combined total shown by default below.
  const totalPoolValue = assets.reduce((s, a) => s + a.usdValue, 0) + usdcBalance + audBalance * AUD_TO_USD;
  // Derive user value from LIVE pool value × their share allocation, not a stale server snapshot.
  // Server returns allocation% = (userShares / totalShares) × 100, which stays valid as long as
  // no new deposits/withdrawals occur. This keeps the user value accurate as prices update.
  const userValue = userPosition
    ? totalPoolValue * (userPosition.allocation / 100)
    : 0;

  // "Pool" default — the cumulative total across EVERY connected wallet
  // (same figure the Leaderboard shows), not just the admin's own account.
  // Falls back to the admin's own account value only while the combined
  // leaderboard hasn't loaded yet, so the page never shows $0.
  const combinedTotalValue = liveLeaderboard ? liveLeaderboard.combinedValue : totalPoolValue;
  // "Mine" — this wallet's own real live Swyftx balance (read via its own
  // key), not a pooled-shares allocation. Falls back to the legacy share
  // value only if this wallet has no personal key connected yet.
  const myLiveValue = livePosition ? livePosition.totalValue : userValue;

  // ── Load data (all public — no wallet needed) ──
  const loadData = useCallback(async () => {
    try {
      setApiStatus("connecting");
      activityLog.log("Connecting to exchange and price feeds...", "info");

      // Start the slow, independent reads (each one reads every connected
      // wallet's own Swyftx account server-side) RIGHT NOW so they overlap
      // with the first wave below instead of queueing behind it. None of
      // them need priceData/poolVal.
      const earlyTraderState = fetchTraderState();
      const earlyLivePosition = isConnected ? fetchLivePosition(walletAddress) : Promise.resolve(null);
      const earlyMyHoldings = isConnected && !isAdmin ? fetchPersonalPricedHoldings(walletAddress) : Promise.resolve([]);
      const earlyLeaderboard = fetchLiveLeaderboard();
      const earlyMyCashFlows = isConnected ? fetchWalletCashFlows(walletAddress) : Promise.resolve(null);
      const earlyCommunityCashFlows = fetchCommunityCashFlows();

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

      // Show the page as soon as the core data (balances + prices) is in.
      // The slower community reads below fill in as they arrive instead of
      // keeping the whole page on a spinner until the slowest one finishes.
      setLoading(false);

      // Calculate pool value for MongoDB queries (crypto + cash)
      const poolVal = merged.reduce((s, a) => s + a.usdValue, 0) + cashData.usdc + cashData.aud * AUD_TO_USD;

      // Second wave: trader state, pending orders, this wallet's own
      // position/holdings/cash-flows, and the two community-wide reads
      // (leaderboard + cash flows). These used to be awaited ONE AT A TIME
      // in sequence — several of them (fetchLiveLeaderboard,
      // fetchCommunityCashFlows) each read every connected wallet's own
      // Swyftx account server-side, so stacking them serially on top of
      // each other made the page noticeably slow to load even with only a
      // handful of connected wallets. None of these actually depend on
      // each other (only on priceData/poolVal from the FIRST wave above),
      // so firing them together lets them overlap instead of queueing.
      const [
        traderStateResult,
        pendingOrdersResult,
        userPositionResult,
        livePositionResult,
        myHoldingsResult,
        leaderboardResult,
        myCashFlowsResult,
        communityCashFlowsResult,
      ] = await Promise.allSettled([
        earlyTraderState,
        fetchEnrichedPendingOrders(priceData),
        isConnected && poolVal > 0 ? fetchUserPosition(walletAddress, poolVal) : Promise.resolve(null),
        earlyLivePosition,
        earlyMyHoldings,
        earlyLeaderboard,
        earlyMyCashFlows,
        earlyCommunityCashFlows,
      ]);

      // Fetch trader state for insight cards (bot status, tier config)
      setTraderState(traderStateResult.status === "fulfilled" ? traderStateResult.value : null);

      // Fetch live pending order count from Swyftx (not stale MongoDB data)
      setPendingOrderCount(pendingOrdersResult.status === "fulfilled" ? pendingOrdersResult.value.length : 0);

      // Fetch this wallet's pooled-shares allocation — still needed for the
      // legacy "Mine/Pool" holdings toggle and the admin's deposit/withdrawal
      // tools, which track the shared legacy Swyftx account separately from
      // each wallet's own non-custodial key below.
      if (isConnected && poolVal > 0 && userPositionResult.status === "fulfilled") {
        setUserPosition(userPositionResult.value);
      }

      // Fetch this wallet's REAL cumulative cash + crypto balance, read live
      // from their own linked Swyftx key — this is what "Your Position"
      // displays now, not a pooled-shares allocation. Null if no active key.
      setLivePosition(
        isConnected && livePositionResult.status === "fulfilled" ? livePositionResult.value : null,
      );

      // This wallet's own real per-coin holdings for the "Mine" Holdings
      // grid (non-admin only — admin's "Mine" is already the real master
      // account via `assets` above, nothing extra to fetch).
      setMyHoldings(
        isConnected && !isAdmin && myHoldingsResult.status === "fulfilled" ? myHoldingsResult.value : [],
      );

      // Combined total across every connected wallet (public) — this is now
      // the default "Pool" figure everywhere on this page, matching what
      // the Leaderboard shows, instead of just the admin's own account.
      setLiveLeaderboard(leaderboardResult.status === "fulfilled" ? leaderboardResult.value : null);

      // Growth/P&L history for the card's area chart — this wallet's own
      // deposit/withdrawal history (public, any connected wallet — not
      // admin-gated) for "Mine", and the combined timeline across every
      // wallet for "Pool".
      setMyCashFlows(
        isConnected && myCashFlowsResult.status === "fulfilled" ? myCashFlowsResult.value : null,
      );
      setCommunityCashFlows(
        communityCashFlowsResult.status === "fulfilled" ? communityCashFlowsResult.value : null,
      );

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

  // Keep a ref to the latest live prices so the balance-refresh interval
  // below can read current prices without restarting every time they tick
  // (wsPrices updates ~once/sec — that would reset a `prices`-dependent
  // interval constantly).
  const pricesRef = useRef(prices);
  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  // Re-fetch actual Swyftx BALANCES (coin quantities), not just prices,
  // every 90s — matching what HoldingsList's RefreshClock countdown visibly
  // promises. Before this, `assets`/`myHoldings` only ever loaded once on
  // mount/manual refresh; the interval above only refreshes prices for an
  // already-fetched balance snapshot. A trade placed anywhere (bot, manual,
  // test buy, or from the Leaderboard) would leave the Holdings grid frozen
  // on the pre-trade balance indefinitely even though Swyftx's own app (and
  // the real account) had already updated — this is what actually fetches
  // the current numbers so the two agree without a manual pull-to-refresh.
  //
  // liveLeaderboard/communityCashFlows were missing from this interval
  // entirely — they only ever loaded once (on mount or a manual refreshKey
  // bump), even though they back the Pool Total doughnut, its growth chart,
  // and the "Pool" Holdings grid (every OTHER wallet's balances/prices, not
  // just this device's own). The RefreshClock under Holdings visibly
  // promises a 90s cycle for whichever grid is showing; Pool just silently
  // never refreshed on its own, unlike Mine. Confirmed live 2026-10-25: the
  // Pool Total card and Pool Holdings grid stayed frozen on page-load
  // numbers no matter how long the tab was left open. Added here so both
  // views genuinely refresh every 90s, same cycle, same promise.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPortfolio()
        .then((portfolioData) => {
          setAssets((prev) =>
            portfolioData.map((a) => {
              const existing = prev.find((p) => p.code === a.code);
              const priceUsd = pricesRef.current[a.code] || existing?.priceUsd || a.priceUsd;
              return {
                ...a,
                priceUsd,
                change24h: existing?.change24h ?? a.change24h,
                usdValue: a.balance > 0 ? a.balance * priceUsd : a.usdValue,
              };
            }),
          );
        })
        .catch(() => {});

      if (isConnected && !isAdmin && walletAddress) {
        fetchPersonalPricedHoldings(walletAddress).then(setMyHoldings).catch(() => {});
      }

      fetchLiveLeaderboard().then(setLiveLeaderboard).catch(() => {});
      fetchCommunityCashFlows().then(setCommunityCashFlows).catch(() => {});
      if (isConnected && walletAddress) {
        fetchWalletCashFlows(walletAddress).then(setMyCashFlows).catch(() => {});
      }
    }, 90_000);
    return () => clearInterval(interval);
  }, [isConnected, isAdmin, walletAddress]);

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
              {!(showAutoAdmin && isAdmin) && !showTriggerView && !showTradePanel && !showHighRisk && (() => {
                // Default view ("Pool") is now the combined total across
                // EVERY connected wallet — same figure the Leaderboard shows
                // — not just the admin's own account. "Mine" is this
                // wallet's own real live Swyftx balance. Available to ANY
                // connected wallet (admin included), not just non-admins.
                const viewingMine = holdingsView === "mine" && isConnected;
                const chartTotal = viewingMine ? myLiveValue : combinedTotalValue;

                // Per-coin tap-to-trade wedges only make sense for the
                // admin's OWN real tradeable account — the combined pool
                // total is many independent people's money, nothing to tap.
                // "Pool" is one slice per connected wallet — the exact same
                // breakdown and color palette as the Leaderboard's "Combined
                // Total" doughnut, since they show the same total figure and
                // are meant to be the same chart, just in two places. Falls
                // back to a cash/crypto split only on the rare render before
                // the leaderboard has loaded at all.
                const synth = (code: string, name: string, usdValue: number, color: string): PortfolioAsset => ({
                  code, name, balance: usdValue, audValue: usdValue / AUD_TO_USD, usdValue,
                  change24h: 0, priceUsd: 1, color, icon: "",
                });
                const chartAssets: PortfolioAsset[] =
                  viewingMine && isAdmin
                    ? assets
                    : viewingMine
                      ? [
                          synth("USDC", "Cash", livePosition?.cashValue ?? 0, "#22c55e"),
                          synth("CRYPTO", "Crypto", livePosition?.cryptoValue ?? 0, "#8b5cf6"),
                        ].filter((a) => a.usdValue > 0)
                      : liveLeaderboard
                        ? liveLeaderboard.entries
                            .filter((e) => e.totalValue > 0)
                            .map((e, i) => synth(e.walletShort, e.walletShort, e.totalValue, LEADERBOARD_PALETTE[i % LEADERBOARD_PALETTE.length]))
                        : [
                            synth("USDC", "Cash", usdcBalance, "#22c55e"),
                            synth("CRYPTO", "Crypto", totalPoolValue - usdcBalance, "#8b5cf6"),
                          ].filter((a) => a.usdValue > 0);

                // Top-left corner label — contextual to whichever view is
                // showing: how many coins make up "Mine", how many people
                // make up "Pool". Mirrors the same asset list the non-admin
                // "Mine" subtitle already used (myHoldings), generalized so
                // it also covers the admin's own real account.
                const viewerAssetList = isAdmin ? assets : myHoldings;
                const nonCashAssetCount = viewerAssetList.filter((a) => a.code !== "AUD" && a.code !== "USDC").length;
                const cornerLabel = viewingMine
                  ? `${nonCashAssetCount} Asset${nonCashAssetCount === 1 ? "" : "s"}`
                  : `${liveLeaderboard?.walletCount ?? 0} User${liveLeaderboard?.walletCount === 1 ? "" : "s"}`;

                // Growth/P&L area chart — same component and same slim
                // layout for both views, just a different data source:
                // this wallet's own deposit/withdrawal history for "Mine",
                // the combined timeline across every wallet for "Pool".
                const growthHistory = viewingMine
                  ? (myCashFlows ? buildLiveCashFlowHistory(myCashFlows.flows, myLiveValue) : [])
                  : (communityCashFlows ? buildCommunityCashFlowHistory(communityCashFlows.timeline, combinedTotalValue) : []);

                return (
                <div className="relative rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                  {/* Top-left: contextual count (assets for Mine, users for Pool) */}
                  <div className="absolute top-3 left-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {cornerLabel}
                  </div>

                  {/* Top-right: slim, single-column Mine/Pool toggle — any connected wallet */}
                  {isConnected && (
                    <div className="absolute top-3 right-3 flex flex-col gap-1">
                      <button
                        onClick={() => setHoldingsView("pool")}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all leading-none ${
                          holdingsView === "pool"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "text-slate-500 hover:text-slate-300 border border-transparent"
                        }`}
                      >
                        Pool
                      </button>
                      <button
                        onClick={() => setHoldingsView("mine")}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all leading-none ${
                          holdingsView === "mine"
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "text-slate-500 hover:text-slate-300 border border-transparent"
                        }`}
                      >
                        Mine
                      </button>
                    </div>
                  )}

                  <PortfolioChart
                    assets={chartAssets}
                    totalValue={chartTotal}
                    usdcBalance={usdcBalance}
                    label={viewingMine ? "My Position" : "Pool Total"}
                    subtitle={
                      viewingMine && isAdmin
                        ? `${assets.filter((a) => a.code !== "AUD" && a.code !== "USDC").length} assets + cash`
                        : viewingMine
                          ? "Your live Swyftx balance"
                          : `${liveLeaderboard?.walletCount ?? 0} connected wallet${liveLeaderboard?.walletCount === 1 ? "" : "s"}, combined`
                    }
                    onSelectAsset={viewingMine && isAdmin ? handleSelectAsset : undefined}
                  />

                  {/* Admin: tap coin to trade / User: connect to join */}
                  <p className="text-center text-xs text-slate-500 mt-1">
                    {viewingMine && isAdmin ? "Tap coin to trade" : !isConnected ? "Connect wallet to join" : ""}
                  </p>

                  {/* Growth / P&L — slim area chart, same for Mine and Pool */}
                  <div className="mt-3 pt-3 border-t border-white/[0.04]">
                    <GrowthAreaChart points={growthHistory} />
                  </div>
                </div>
                );
              })()}

              {/* ─── Trade Buttons + Cash + Stats (PUBLIC - visible to ALL, hidden on perp page) ── */}
              {/* When the Auto view is open, break this card out of the max-w-2xl
                  column on md+ and centre it (up to max-w-5xl) on the viewport so
                  the 3-column monitoring grid has the same room as the view-only
                  modal. Capped at 92vw to avoid horizontal scroll. */}
              {!showHighRisk && (
              <div className={`rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4 ${(showAutoAdmin || showTriggerView) && isAdmin ? "pb-2" : ""} ${showAutoAdmin && isAdmin ? "md:relative md:left-1/2 md:w-[92vw] md:max-w-5xl md:-translate-x-1/2" : ""}`}>
                {/* Admin: nav buttons — FLUB-style pills in a dark container (hidden on perp page) */}
                {isAdmin && !showHighRisk && (
                  <div
                    className={`rounded-xl bg-slate-900/60 border border-white/[0.04] p-1.5 overflow-x-auto ${showAutoAdmin || showTriggerView || showTradePanel || showHighRisk ? "" : "mb-3"}`}
                    style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent", WebkitOverflowScrolling: "touch" }}
                  >
                    <div className="flex gap-1.5" style={{ minWidth: "max-content" }}>
                      {([
                        { key: "instant", label: "Instant", icon: "\u26A1", active: showTradePanel, color: "blue",
                          onClick: () => { if (assets.length > 0) { setSelectedAsset(assets[0].code); setShowTradePanel(true); setShowTriggerView(false); setShowAutoAdmin(false); setShowHighRisk(false); } } },
                        { key: "trigger", label: "Trigger", icon: "\u2699", active: showTriggerView, color: "amber",
                          onClick: () => { setShowTriggerView(!showTriggerView); setShowTradePanel(false); setShowAutoAdmin(false); setShowHighRisk(false); } },
                        { key: "auto", label: "Auto", icon: "\u2728", active: showAutoAdmin, color: "emerald",
                          onClick: () => { setShowAutoAdmin(!showAutoAdmin); setShowTradePanel(false); setShowTriggerView(false); setShowHighRisk(false); } },
                        { key: "coinstats", label: "Coin Stats", icon: "\uD83E\uDE99", active: showStats, color: "teal",
                          onClick: () => setShowStats(true) },
                        { key: "desk", label: "Desk", icon: "\u2600\uFE0F", active: false, color: "teal",
                          onClick: () => navigate("/desk") },
                        { key: "signals", label: "Signals", icon: "\uD83C\uDFAF", active: false, color: "blue",
                          onClick: () => navigate("/signals") },
                        { key: "mykey", label: "My Key", icon: "\uD83D\uDD11", active: showPersonalTrading, color: "emerald",
                          onClick: () => setShowPersonalTrading(true) },
                      ] as const)
                        // BUDJU Gate — only show "My Key" to a wallet holding 10M+ BUDJU
                        .filter((btn) => btn.key !== "mykey" || hasBudjuGateAccess)
                        .map((btn) => {
                        const colorMap: Record<string, { active: string; inactive: string }> = {
                          blue:    { active: "bg-blue-500/25 text-blue-200 border-blue-400/60 shadow-[0_0_8px_rgba(59,130,246,0.25)]", inactive: "bg-blue-500/8 text-blue-300/70 border-blue-500/25 hover:bg-blue-500/15 hover:text-blue-200 hover:border-blue-400/50" },
                          amber:   { active: "bg-amber-500/25 text-amber-200 border-amber-400/60 shadow-[0_0_8px_rgba(245,158,11,0.25)]", inactive: "bg-amber-500/8 text-amber-300/70 border-amber-500/25 hover:bg-amber-500/15 hover:text-amber-200 hover:border-amber-400/50" },
                          emerald: { active: "bg-emerald-500/25 text-emerald-200 border-emerald-400/60 shadow-[0_0_8px_rgba(16,185,129,0.25)]", inactive: "bg-emerald-500/8 text-emerald-300/70 border-emerald-500/25 hover:bg-emerald-500/15 hover:text-emerald-200 hover:border-emerald-400/50" },
                          green:   { active: "bg-green-500/25 text-green-200 border-green-400/60 shadow-[0_0_8px_rgba(34,197,94,0.25)]", inactive: "bg-green-500/8 text-green-300/70 border-green-500/25 hover:bg-green-500/15 hover:text-green-200 hover:border-green-400/50" },
                          red:     { active: "bg-red-500/25 text-red-200 border-red-400/60 shadow-[0_0_8px_rgba(239,68,68,0.25)]", inactive: "bg-red-500/8 text-red-300/70 border-red-500/25 hover:bg-red-500/15 hover:text-red-200 hover:border-red-400/50" },
                          teal:    { active: "bg-teal-500/25 text-teal-200 border-teal-400/60 shadow-[0_0_8px_rgba(20,184,166,0.25)]", inactive: "bg-teal-500/8 text-teal-300/70 border-teal-500/25 hover:bg-teal-500/15 hover:text-teal-200 hover:border-teal-400/50" },
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

                {/* Non-admin: insight buttons (Orders / Auto Trader / Live Charts / Stats) — one scrollable row */}
                {!isAdmin && (
                  <div
                    className="flex gap-2 overflow-x-auto pb-1 mb-3 -mx-1 px-1 snap-x"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
                  >
                    {/* Orders */}
                    <button
                      onClick={() => setShowTriggerView(!showTriggerView)}
                      className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
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
                          {pendingOrderCount > 0 ? `${pendingOrderCount} pending` : "None"}
                        </div>
                      </div>
                    </button>
                    {/* Auto Trader */}
                    <button
                      onClick={() => setShowAutoTrader(true)}
                      className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
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
                    {/* BUDJU Desk — daily AI briefing */}
                    <button
                      onClick={() => navigate("/desk")}
                      className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
                      style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.2)" }}
                    >
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,184,166,0.15)" }}>
                        <span className="text-sm">☀️</span>
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                          Desk{" "}
                          <span className="text-[8px] bg-teal-500/15 text-teal-300 px-1 py-0.5 rounded font-mono border border-teal-500/20 align-middle">NEW</span>
                        </div>
                        <div className="text-[10px] font-bold text-teal-400">Daily brief</div>
                      </div>
                    </button>
                    {/* Signals — copy-trading paper trading sandbox */}
                    <button
                      onClick={() => navigate("/signals")}
                      className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
                      style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}
                    >
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(59,130,246,0.15)" }}>
                        <span className="text-sm">🎯</span>
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                          Signals{" "}
                          <span className="text-[8px] bg-blue-500/15 text-blue-300 px-1 py-0.5 rounded font-mono border border-blue-500/20 align-middle">NEW</span>
                        </div>
                        <div className="text-[10px] font-bold text-blue-400">Paper trading</div>
                      </div>
                    </button>
                    {/* Stats */}
                    <button
                      onClick={() => setShowStats(true)}
                      className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
                      style={{ background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.2)" }}
                    >
                      <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(20,184,166,0.15)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                          <path d="M3 3v18h18" />
                          <rect x="7" y="11" width="3" height="6" />
                          <rect x="12" y="7" width="3" height="10" />
                          <rect x="17" y="13" width="3" height="4" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <div className="text-[11px] font-bold text-slate-300">Stats</div>
                        <div className="text-[10px] font-bold text-teal-400">Per-coin</div>
                      </div>
                    </button>
                    {/* My Exchange Key — non-custodial: connect your own Swyftx
                        key. BUDJU Gate: only shown to a wallet holding 10M+
                        BUDJU — otherwise there's simply no access, same as
                        every other BUDJU-gated feature in the app. */}
                    {hasBudjuGateAccess && (
                      <button
                        onClick={() => setShowPersonalTrading(true)}
                        className="flex-shrink-0 basis-[44%] min-w-[148px] flex items-center gap-2.5 py-3 px-3 rounded-xl transition-all hover:brightness-125 snap-start"
                        style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}
                      >
                        <div className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: "rgba(16,185,129,0.15)" }}>
                          <span className="text-sm">🔑</span>
                        </div>
                        <div className="text-left">
                          <div className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                            My Exchange Key{" "}
                            <span className="text-[8px] bg-emerald-500/15 text-emerald-300 px-1 py-0.5 rounded font-mono border border-emerald-500/20 align-middle">NEW</span>
                          </div>
                          <div className="text-[10px] font-bold text-emerald-400">Trade your own account</div>
                        </div>
                      </button>
                    )}
                  </div>
                )}

                {/* Cash breakdown by currency + Crypto/Cash Ratio Meter —
                    cumulative across EVERY connected wallet (not just the
                    admin's own account), visible to all, hidden when trade
                    views open. Each currency shown in its OWN units — the
                    old "USDC Balance" label blended AUD/USD/USDT into one
                    figure, which is exactly the "your usdc value is wrong"
                    complaint: that number was never pure USDC. USDC is
                    headlined since it's the one actually traded with. */}
                {!(showAutoAdmin && isAdmin) && !showTriggerView && !showTradePanel && !showHighRisk && (() => {
                  // Respect the Pool/Mine toggle above — "Mine" must show
                  // THIS wallet's own cash, not the combined pool. Previously
                  // this card ignored holdingsView entirely and always
                  // rendered liveLeaderboard's combined totals, so clicking
                  // "Mine" still showed the overall pool's numbers here.
                  const viewingMine = holdingsView === "mine" && isConnected;
                  const byCurrency = viewingMine
                    ? (livePosition?.cashByCurrency ?? { AUD: 0, USD: 0, USDC: usdcBalance, USDT: 0 })
                    : (liveLeaderboard?.cashByCurrency ?? { AUD: 0, USD: 0, USDC: usdcBalance, USDT: 0 });
                  const combinedCash = viewingMine
                    ? (livePosition?.cashValue ?? usdcBalance)
                    : liveLeaderboard
                      ? liveLeaderboard.entries.reduce((s, e) => s + e.cashValue, 0)
                      : usdcBalance;
                  const combinedCrypto = viewingMine
                    ? (livePosition?.cryptoValue ?? assets.reduce((s, a) => s + a.usdValue, 0))
                    : liveLeaderboard
                      ? liveLeaderboard.entries.reduce((s, e) => s + e.cryptoValue, 0)
                      : assets.reduce((s, a) => s + a.usdValue, 0);
                  const totalVal = combinedCrypto + combinedCash;
                  const cryptoPct = totalVal > 0 ? Math.round((combinedCrypto / totalVal) * 100) : 0;
                  const cashPct = totalVal > 0 ? 100 - cryptoPct : 0;
                  const fmt2 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
                  return (
                    <div className="mb-3 rounded-xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm px-4 py-3">
                      <div className="flex items-center gap-2 mb-2.5">
                        <div className="w-6 h-6 rounded-full bg-green-500/15 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-green-400">$</span>
                        </div>
                        <span className="text-[11px] font-semibold text-slate-300">
                          {viewingMine
                            ? "My Cash Balances"
                            : `Cash Balances${liveLeaderboard ? ` (${liveLeaderboard.walletCount} wallets)` : ""}`}
                        </span>
                      </div>

                      {/* USDC headlined — what you actually trade with */}
                      <div className="rounded-lg bg-slate-900/50 border border-green-500/20 px-3 py-2 mb-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-green-400">USDC</span>
                          <span className="text-lg font-bold text-green-400 font-mono">
                            ${fmt2(byCurrency.USDC)}
                          </span>
                        </div>
                      </div>

                      {/* AUD / USD / USDT — each in its own native units */}
                      <div className="grid grid-cols-3 gap-2 mb-2.5">
                        <div className="rounded-lg bg-slate-900/40 border border-white/[0.04] py-1.5 text-center">
                          <div className="text-[9px] text-slate-500 font-semibold">AUD</div>
                          <div className="text-[11px] font-bold text-amber-400 font-mono">${fmt2(byCurrency.AUD)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/40 border border-white/[0.04] py-1.5 text-center">
                          <div className="text-[9px] text-slate-500 font-semibold">USD</div>
                          <div className="text-[11px] font-bold text-slate-300 font-mono">${fmt2(byCurrency.USD)}</div>
                        </div>
                        <div className="rounded-lg bg-slate-900/40 border border-white/[0.04] py-1.5 text-center">
                          <div className="text-[9px] text-slate-500 font-semibold">USDT</div>
                          <div className="text-[11px] font-bold text-teal-400 font-mono">${fmt2(byCurrency.USDT)}</div>
                        </div>
                      </div>

                      {/* Ratio meter */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-semibold text-cyan-400">
                            {cryptoPct}% Crypto
                          </span>
                          <span className="text-[10px] font-semibold text-green-400">
                            {cashPct}% Cash
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
                              width: `${cashPct}%`,
                              background: "linear-gradient(90deg, #22c55e, #4ade80)",
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[9px] text-slate-500 font-mono">
                            ${Math.round(combinedCrypto).toLocaleString()}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            ${Math.round(combinedCash).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* The old "USDC (my account)" / "AUD (my account)" row that
                    used to live here was removed (Oct 2026) — it just
                    repeated the admin's own balances a second time
                    underneath the "Cash Balances (N wallets)" card above,
                    which already breaks out USDC/AUD/USD/USDT (combined
                    across every wallet) plus the crypto/cash ratio meter.
                    Duplicate numbers, no new information. */}

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
                    className="md:relative md:left-1/2 md:w-[92vw] md:max-w-5xl md:-translate-x-1/2"
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
              {!(showAutoAdmin && isAdmin) && !showTriggerView && !showTradePanel && !showHighRisk && (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
                <HoldingsList
                  assets={
                    // "Mine" always means THIS wallet's own coins (admin or
                    // not). "Pool" means the true combined coin list across
                    // EVERY connected wallet — admin's own `assets` used to
                    // be shown here for Pool too, which is why coins only
                    // held in OTHER wallets (ARB, LEVER, STRK, LUMIA, etc.)
                    // never appeared even though the "Pool Total" doughnut
                    // above was already counting their dollar value.
                    isConnected && holdingsView === "mine"
                      ? (isAdmin ? assets : myHoldings)
                      : poolAssetsFromLeaderboard(liveLeaderboard)
                  }
                  prices={prices}
                  onSelectAsset={handleSelectAsset}
                  selectedAsset={selectedAsset}
                  isAdmin={isAdmin}
                  viewMode={isConnected ? holdingsView : "pool"}
                  onToggleView={isConnected ? setHoldingsView : undefined}
                  adminWallet={walletAddress}
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
        isAdmin={isAdmin}
        adminWallet={walletAddress}
      />
      <TransactionHistory
        isOpen={showTransactions}
        onClose={() => { setShowTransactions(false); setActiveNav("home"); }}
        walletAddress={walletAddress}
        isAdmin={isAdmin}
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
      <PersonalTradingView
        isOpen={showPersonalTrading}
        onClose={() => setShowPersonalTrading(false)}
        wallet={walletAddress}
        isAdmin={isAdmin}
      />
      <CoinStatsView
        isOpen={showStats}
        onClose={() => setShowStats(false)}
        prices={prices}
        assets={assets}
        wallet={isConnected ? walletAddress : undefined}
        assetsMine={isAdmin ? assets : myHoldings}
        assetsEveryone={poolAssetsFromLeaderboard(liveLeaderboard)}
      />
      <PoolPerformanceView
        isOpen={showPerformance}
        onClose={() => setShowPerformance(false)}
        adminWallet={walletAddress}
        totalPoolValue={totalPoolValue}
        onChanged={() => { clearCache(); loadData(); }}
      />
    </main>
  );
};

export default Trade;
