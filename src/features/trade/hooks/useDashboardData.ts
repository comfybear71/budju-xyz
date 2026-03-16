import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@hooks/useWallet";
import { useLivePrices } from "@hooks/useLivePrices";
import {
  fetchPerpAccount,
  fetchPerpPositions,
  fetchPerpTrades,
  fetchPerpMarkets,
  fetchPerpEquity,
  fetchPublicPerpData,
  fetchStrategyStatus,
  toggleAutoTrading,
  placePerpOrder,
  closePerpPosition,
  modifyPerpPosition,
  resetPerpAccount,
  setTradingMode,
  setKillSwitch,
} from "../services/perpApi";
import type {
  PerpAccount,
  PerpPosition,
  PerpTrade,
  PerpMarket,
  PerpEquitySnapshot,
  PerpOrderRequest,
  StrategyStatus,
} from "../types/perps";

const DEFAULT_MARKETS: PerpMarket[] = [
  { symbol: "SOL-PERP", base_asset: "SOL", max_leverage: 50, tick_size: 0.01, coingecko_id: "solana" },
  { symbol: "BTC-PERP", base_asset: "BTC", max_leverage: 50, tick_size: 0.1, coingecko_id: "bitcoin" },
  { symbol: "ETH-PERP", base_asset: "ETH", max_leverage: 50, tick_size: 0.01, coingecko_id: "ethereum" },
  { symbol: "DOGE-PERP", base_asset: "DOGE", max_leverage: 20, tick_size: 0.00001, coingecko_id: "dogecoin" },
  { symbol: "AVAX-PERP", base_asset: "AVAX", max_leverage: 20, tick_size: 0.01, coingecko_id: "avalanche-2" },
  { symbol: "LINK-PERP", base_asset: "LINK", max_leverage: 20, tick_size: 0.001, coingecko_id: "chainlink" },
  { symbol: "SUI-PERP", base_asset: "SUI", max_leverage: 20, tick_size: 0.001, coingecko_id: "sui" },
  { symbol: "RENDER-PERP", base_asset: "RENDER", max_leverage: 20, tick_size: 0.001, coingecko_id: "render-token" },
  { symbol: "JUP-PERP", base_asset: "JUP", max_leverage: 10, tick_size: 0.0001, coingecko_id: "jupiter-exchange-solana" },
];

export interface DashboardData {
  // Data
  account: PerpAccount | null;
  positions: PerpPosition[];
  trades: PerpTrade[];
  markets: PerpMarket[];
  equity: PerpEquitySnapshot[];
  prices: Record<string, number>;
  strategyStatus: StrategyStatus | null;

  // State
  loading: boolean;
  error: string | null;
  wallet: string | undefined;
  wsConnected: boolean;

  // Computed
  isLive: boolean;
  isKillSwitchActive: boolean;
  autoTradingEnabled: boolean | null;
  totalPnl: number;
  totalPnlPct: number;

  // Selected market
  selectedSymbol: string;
  selectedBaseAsset: string;
  setSelectedSymbol: (symbol: string) => void;

  // Handlers
  handlePlaceOrder: (order: PerpOrderRequest) => Promise<void>;
  handleClosePosition: (positionId: string, exitPrice: number) => Promise<void>;
  handleModifyPosition: (positionId: string, mods: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number }) => Promise<void>;
  handleKillSwitch: () => Promise<void>;
  handleSwitchMode: () => Promise<void>;
  handleToggleBot: () => Promise<void>;
  handleReset: () => Promise<void>;
  clearError: () => void;
  refreshData: () => void;
}

export function useDashboardData(): DashboardData {
  const { connection } = useWallet();
  const wallet = connection.wallet?.address;

  // Core data
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [positions, setPositions] = useState<PerpPosition[]>([]);
  const [trades, setTrades] = useState<PerpTrade[]>([]);
  const [markets, setMarkets] = useState<PerpMarket[]>(DEFAULT_MARKETS);
  const [equity, setEquity] = useState<PerpEquitySnapshot[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState("SOL-PERP");
  const [autoTradingEnabled, setAutoTradingEnabled] = useState<boolean | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Live prices from Binance WS
  const { prices: wsPrices, wsState } = useLivePrices(1000);
  const marketsRef = useRef(markets);
  marketsRef.current = markets;

  // Merge WS prices into perp prices
  useEffect(() => {
    if (Object.keys(wsPrices).length === 0) return;
    const merged: Record<string, number> = {};
    for (const m of marketsRef.current) {
      if (wsPrices[m.base_asset]) merged[m.symbol] = wsPrices[m.base_asset];
    }
    if (Object.keys(merged).length > 0) {
      setPrices((prev) => ({ ...prev, ...merged }));
    }
  }, [wsPrices]);

  // Load all perp data
  const loadData = useCallback(async () => {
    if (!wallet) {
      // Public read-only data
      try {
        const data = await fetchPublicPerpData();
        setAccount(data.account);
        setPositions(data.positions);
        setTrades(data.trades);
        setEquity(data.equity);
        if (data.markets.length > 0) setMarkets(data.markets);
      } catch {
        // Silently fail for public data
      }
      setLoading(false);
      return;
    }

    try {
      const results = await Promise.allSettled([
        fetchPerpAccount(wallet),
        fetchPerpPositions(wallet),
        fetchPerpTrades(wallet),
        fetchPerpMarkets(),
        fetchPerpEquity(wallet, "all"),
        fetchStrategyStatus(wallet),
      ]);

      if (results[0].status === "fulfilled") setAccount(results[0].value);
      if (results[1].status === "fulfilled") setPositions(results[1].value.positions);
      if (results[2].status === "fulfilled") setTrades(results[2].value.trades);
      if (results[3].status === "fulfilled" && results[3].value.markets.length > 0) {
        setMarkets(results[3].value.markets);
      }
      if (results[4].status === "fulfilled") setEquity(results[4].value.equity);
      if (results[5].status === "fulfilled") {
        setStrategyStatus(results[5].value);
        setAutoTradingEnabled(results[5].value.auto_trading_enabled);
      }

      // Extract prices from positions
      const p: Record<string, number> = {};
      if (results[1].status === "fulfilled") {
        results[1].value.positions.forEach((pos: PerpPosition) => {
          if (pos.mark_price > 0) p[pos.symbol] = pos.mark_price;
        });
      }
      setPrices((prev) => ({ ...prev, ...p }));
    } catch (err) {
      console.error("Dashboard data load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  // Initial load + 30s polling
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // CoinGecko price fallback
  useEffect(() => {
    if (markets.length === 0) return;
    const fetchCGPrices = async () => {
      try {
        const ids = markets.map((m) => m.coingecko_id).join(",");
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
        const data = await res.json();
        const p: Record<string, number> = {};
        markets.forEach((m) => {
          if (data[m.coingecko_id]?.usd) p[m.symbol] = data[m.coingecko_id].usd;
        });
        setPrices((prev) => ({ ...prev, ...p }));
      } catch { /* prices come from WS or positions */ }
    };
    fetchCGPrices();
    const interval = setInterval(fetchCGPrices, 60_000);
    return () => clearInterval(interval);
  }, [markets]);

  // Computed values
  const isLive = account?.trading_mode === "live";
  const isKillSwitchActive = account?.kill_switch === true;

  const totalPnl = positions.reduce((sum, p) => {
    const livePrice = prices[p.symbol] || p.mark_price;
    const delta = p.direction === "long"
      ? livePrice - p.mark_price
      : p.mark_price - livePrice;
    const adjustment = (delta / p.entry_price) * p.size_usd;
    return sum + p.unrealized_pnl + adjustment;
  }, 0);

  const totalMargin = positions.reduce((sum, p) => sum + p.margin, 0);
  const totalPnlPct = totalMargin > 0 ? (totalPnl / totalMargin) * 100 : 0;

  const selectedBaseAsset = markets.find((m) => m.symbol === selectedSymbol)?.base_asset || "SOL";

  // Handlers
  const handlePlaceOrder = useCallback(async (order: PerpOrderRequest) => {
    if (!wallet) { setError("Wallet not connected"); return; }
    try {
      setActionLoading(true);
      setError(null);
      await placePerpOrder(order, wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setActionLoading(false);
    }
  }, [wallet, loadData]);

  const handleClosePosition = useCallback(async (positionId: string, exitPrice: number) => {
    if (!wallet) { setError("Wallet not connected"); return; }
    try {
      setActionLoading(true);
      setError(null);
      await closePerpPosition(positionId, exitPrice, "manual", wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setActionLoading(false);
    }
  }, [wallet, loadData]);

  const handleModifyPosition = useCallback(async (
    positionId: string,
    mods: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number },
  ) => {
    if (!wallet) { setError("Wallet not connected"); return; }
    try {
      setActionLoading(true);
      await modifyPerpPosition(positionId, mods, wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to modify");
    } finally {
      setActionLoading(false);
    }
  }, [wallet, loadData]);

  const handleKillSwitch = useCallback(async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    const activating = !isKillSwitchActive;
    if (activating) {
      if (!confirm(
        "ACTIVATE KILL SWITCH\n\nThis will IMMEDIATELY:\n• Close ALL open positions\n• Pause all trading\n• Stop the auto-trading bot\n\nContinue?"
      )) return;
    }
    try {
      setError(null);
      await setKillSwitch(wallet, activating);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kill switch failed");
    }
  }, [wallet, isKillSwitchActive, loadData]);

  const handleSwitchMode = useCallback(async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    const newMode = isLive ? "paper" : "live";
    if (newMode === "live") {
      if (!confirm(
        "SWITCH TO LIVE TRADING\n\nThis will use REAL FUNDS on Drift Protocol.\nMake sure you have USDC deposited and SOL for gas.\n\nAre you absolutely sure?"
      )) return;
    }
    try {
      setError(null);
      await setTradingMode(wallet, newMode);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch mode");
    }
  }, [wallet, isLive, loadData]);

  const handleToggleBot = useCallback(async () => {
    if (!wallet || autoTradingEnabled === null) return;
    try {
      setError(null);
      await toggleAutoTrading(!autoTradingEnabled, wallet);
      setAutoTradingEnabled(!autoTradingEnabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle bot");
    }
  }, [wallet, autoTradingEnabled]);

  const handleReset = useCallback(async () => {
    if (!wallet) { setError("Wallet not connected"); return; }
    if (!confirm("Reset paper trading account to $10,000? All positions and history will be deleted.")) return;
    try {
      setError(null);
      await resetPerpAccount(wallet);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    }
  }, [wallet, loadData]);

  return {
    account,
    positions,
    trades,
    markets,
    equity,
    prices,
    strategyStatus,
    loading: loading || actionLoading,
    error,
    wallet,
    wsConnected: wsState.connected,
    isLive,
    isKillSwitchActive,
    autoTradingEnabled,
    totalPnl,
    totalPnlPct,
    selectedSymbol,
    selectedBaseAsset,
    setSelectedSymbol,
    handlePlaceOrder,
    handleClosePosition,
    handleModifyPosition,
    handleKillSwitch,
    handleSwitchMode,
    handleToggleBot,
    handleReset,
    clearError: () => setError(null),
    refreshData: loadData,
  };
}
