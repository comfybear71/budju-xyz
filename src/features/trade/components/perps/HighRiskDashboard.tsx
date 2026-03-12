import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { useWallet } from "@hooks/useWallet";
import PerpAccountSummary from "./PerpAccountSummary";
import PerpPositionsList from "./PerpPositionsList";
import PerpOrderForm from "./PerpOrderForm";
import PerpMetricsPanel from "./PerpMetricsPanel";
import PerpTradeHistory from "./PerpTradeHistory";
import PerpEquityChart from "./PerpEquityChart";
import {
  fetchPerpAccount,
  fetchPerpPositions,
  fetchPerpTrades,
  fetchPerpEquity,
  fetchPerpMarkets,
  placePerpOrder,
  closePerpPosition,
  modifyPerpPosition,
  resetPerpAccount,
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
  signAdminMessage: () => Promise<{ wallet: string; signature: number[]; message: string }>;
}

type Tab = "positions" | "order" | "history" | "metrics" | "equity";

const HighRiskDashboard = ({ onClose, signAdminMessage }: Props) => {
  const { connection } = useWallet();

  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [positions, setPositions] = useState<PerpPosition[]>([]);
  const [trades, setTrades] = useState<PerpTrade[]>([]);
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [equity, setEquity] = useState<PerpEquitySnapshot[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("positions");
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [modifySL, setModifySL] = useState("");
  const [modifyTP, setModifyTP] = useState("");
  const [modifyTrail, setModifyTrail] = useState("");

  const wallet = connection.wallet?.address;

  const loadData = useCallback(async () => {
    if (!wallet) return;
    try {
      const [acc, pos, hist, mkts, eq] = await Promise.all([
        fetchPerpAccount(wallet),
        fetchPerpPositions(wallet),
        fetchPerpTrades(wallet),
        fetchPerpMarkets(),
        fetchPerpEquity(wallet, "all"),
      ]);
      setAccount(acc);
      setPositions(pos.positions);
      setTrades(hist.trades);
      setMarkets(mkts.markets);
      setEquity(eq.equity);

      // Extract prices from positions' mark prices
      const p: Record<string, number> = {};
      pos.positions.forEach((position) => {
        if (position.mark_price > 0) p[position.symbol] = position.mark_price;
      });
      setPrices(p);
    } catch (err) {
      console.error("Failed to load perp data:", err);
    }
  }, [wallet]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [loadData]);

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
    try {
      setLoading(true);
      setError(null);
      const { wallet: w, signature, message } = await signAdminMessage();
      await placePerpOrder(order, w, signature, message);
      await loadData();
      setActiveTab("positions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setLoading(false);
    }
  };

  const handleClosePosition = async (positionId: string, exitPrice: number) => {
    try {
      setLoading(true);
      setError(null);
      const { wallet: w, signature, message } = await signAdminMessage();
      await closePerpPosition(positionId, exitPrice, "manual", w, signature, message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close position");
    } finally {
      setLoading(false);
    }
  };

  const handleModifyPosition = async (positionId: string) => {
    if (modifyingId === positionId) {
      // Submit modification
      try {
        setLoading(true);
        const { wallet: w, signature, message } = await signAdminMessage();
        await modifyPerpPosition(
          positionId,
          {
            stopLoss: modifySL ? parseFloat(modifySL) : undefined,
            takeProfit: modifyTP ? parseFloat(modifyTP) : undefined,
            trailingStopPct: modifyTrail ? parseFloat(modifyTrail) : undefined,
          },
          w,
          signature,
          message,
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
    if (!confirm("Reset paper trading account to $10,000? All positions and history will be deleted.")) return;
    try {
      setLoading(true);
      const { wallet: w, signature, message } = await signAdminMessage();
      await resetPerpAccount(w, signature, message);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "positions", label: "Positions", icon: "📍" },
    { key: "order", label: "New Order", icon: "📝" },
    { key: "equity", label: "Equity", icon: "📈" },
    { key: "metrics", label: "Metrics", icon: "📊" },
    { key: "history", label: "History", icon: "📋" },
  ];

  if (!wallet) {
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
      <div className="px-4 py-3 border-b border-red-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <div>
            <h3 className="text-sm font-bold text-red-400">HIGH RISK — PAPER TRADING</h3>
            <p className="text-[10px] text-slate-500">Simulated perpetual futures • No real funds at risk</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white transition-colors text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Account summary */}
        {account && <PerpAccountSummary account={account} />}

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
        {activeTab === "positions" && (
          <PerpPositionsList
            positions={positions}
            onClose={handleClosePosition}
            onModify={handleModifyPosition}
          />
        )}

        {activeTab === "order" && (
          <PerpOrderForm
            markets={markets}
            prices={prices}
            maxBalance={account?.balance || 0}
            onSubmit={handlePlaceOrder}
            loading={loading}
          />
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

        {activeTab === "metrics" && account?.metrics && (
          <PerpMetricsPanel metrics={account.metrics} />
        )}

        {activeTab === "history" && (
          <PerpTradeHistory trades={trades} />
        )}
      </div>
    </motion.div>
  );
};

export default HighRiskDashboard;
