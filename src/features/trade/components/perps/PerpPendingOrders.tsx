// ============================================================
// PerpPendingOrders — Pending limit/stop order management UI
// Shows pending orders with trigger prices, allows creation
// and cancellation. Integrates with the cron-based execution.
// ============================================================

import { useState, useEffect, useCallback } from "react";
import {
  fetchPendingOrders,
  createPendingOrder,
  cancelPendingOrder,
} from "../../services/perpApi";
import { useLivePrices } from "@hooks/useLivePrices";
import type { PerpPendingOrder } from "../../types/perps";

interface Props {
  wallet: string;
  readOnly?: boolean;
}

const MARKET_OPTIONS = [
  "SOL-PERP", "BTC-PERP", "ETH-PERP", "DOGE-PERP",
  "AVAX-PERP", "LINK-PERP", "SUI-PERP", "JUP-PERP",
  "WIF-PERP", "BONK-PERP",
];

function formatPrice(price: number): string {
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.01) return price.toFixed(6);
  return price.toFixed(8);
}

function timeUntil(isoDate: string): string {
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const hours = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const PerpPendingOrders = ({ wallet, readOnly = false }: Props) => {
  const [orders, setOrders] = useState<PerpPendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { prices } = useLivePrices(2000);

  // Form state
  const [symbol, setSymbol] = useState("SOL-PERP");
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"limit" | "stop">("limit");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [sizeUsd, setSizeUsd] = useState("500");
  const [leverage, setLeverage] = useState("5");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [expiryHours, setExpiryHours] = useState("24");

  const loadOrders = useCallback(async () => {
    try {
      const result = await fetchPendingOrders(wallet);
      setOrders(result.orders);
    } catch (err) {
      console.warn("[PendingOrders] Load failed:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30_000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleCreate = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await createPendingOrder({
        symbol,
        direction,
        leverage: parseInt(leverage),
        sizeUsd: parseFloat(sizeUsd),
        orderType,
        triggerPrice: parseFloat(triggerPrice),
        stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
        takeProfit: takeProfit ? parseFloat(takeProfit) : undefined,
        expiryHours: parseFloat(expiryHours),
      }, wallet);
      setShowForm(false);
      setTriggerPrice("");
      setSizeUsd("500");
      setStopLoss("");
      setTakeProfit("");
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      setError(null);
      await cancelPendingOrder(orderId, wallet);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel order");
    }
  };

  // Get base asset for price lookup
  const getBaseAsset = (sym: string) => sym.replace("-PERP", "");

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-pulse text-sm text-slate-400">Loading orders...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-white flex items-center gap-2">
          Pending Orders
          {orders.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {orders.length} active
            </span>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-[10px] px-2 py-1 rounded-lg border border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 transition-colors font-bold"
          >
            {showForm ? "Cancel" : "+ New Order"}
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-slate-500 hover:text-white">x</button>
        </div>
      )}

      {/* Create order form */}
      {showForm && !readOnly && (
        <div className="bg-slate-800/40 rounded-xl p-3 border border-blue-500/15 space-y-3">
          <div className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">New Pending Order</div>

          {/* Row 1: Symbol + Direction + Type */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Market</label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              >
                {MARKET_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m.replace("-PERP", "")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Direction</label>
              <div className="flex mt-0.5 rounded bg-slate-700/50 border border-white/[0.06]">
                <button
                  onClick={() => setDirection("long")}
                  className={`flex-1 text-[10px] py-1.5 font-bold transition-colors rounded-l ${
                    direction === "long" ? "bg-emerald-500/20 text-emerald-400" : "text-slate-500"
                  }`}
                >
                  LONG
                </button>
                <button
                  onClick={() => setDirection("short")}
                  className={`flex-1 text-[10px] py-1.5 font-bold transition-colors rounded-r ${
                    direction === "short" ? "bg-red-500/20 text-red-400" : "text-slate-500"
                  }`}
                >
                  SHORT
                </button>
              </div>
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Type</label>
              <div className="flex mt-0.5 rounded bg-slate-700/50 border border-white/[0.06]">
                <button
                  onClick={() => setOrderType("limit")}
                  className={`flex-1 text-[10px] py-1.5 font-bold transition-colors rounded-l ${
                    orderType === "limit" ? "bg-blue-500/20 text-blue-400" : "text-slate-500"
                  }`}
                >
                  Limit
                </button>
                <button
                  onClick={() => setOrderType("stop")}
                  className={`flex-1 text-[10px] py-1.5 font-bold transition-colors rounded-r ${
                    orderType === "stop" ? "bg-amber-500/20 text-amber-400" : "text-slate-500"
                  }`}
                >
                  Stop
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Trigger Price + Size + Leverage */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 uppercase">
                Trigger Price
                {prices[getBaseAsset(symbol)] && (
                  <span className="text-slate-600 ml-1">(now: ${formatPrice(prices[getBaseAsset(symbol)])})</span>
                )}
              </label>
              <input
                type="number"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder="0.00"
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Size (USD)</label>
              <input
                type="number"
                value={sizeUsd}
                onChange={(e) => setSizeUsd(e.target.value)}
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Leverage</label>
              <input
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                min="2" max="50"
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
          </div>

          {/* Row 3: SL + TP + Expiry */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Stop Loss</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Take Profit</label>
              <input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
            <div>
              <label className="text-[9px] text-slate-500 uppercase">Expiry (hours)</label>
              <input
                type="number"
                value={expiryHours}
                onChange={(e) => setExpiryHours(e.target.value)}
                className="w-full mt-0.5 bg-slate-700/50 text-white text-xs rounded px-2 py-1.5 border border-white/[0.06]"
              />
            </div>
          </div>

          {/* Info */}
          <div className="text-[9px] text-slate-600">
            {orderType === "limit"
              ? direction === "long"
                ? "Limit Buy: Triggers when price drops to or below trigger price"
                : "Limit Sell: Triggers when price rises to or above trigger price"
              : direction === "long"
                ? "Stop Buy: Triggers when price rises to or above trigger price (breakout)"
                : "Stop Sell: Triggers when price drops to or below trigger price (breakdown)"
            }
          </div>

          <button
            onClick={handleCreate}
            disabled={submitting || !triggerPrice}
            className="w-full py-2 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 disabled:opacity-40 transition-colors"
          >
            {submitting ? "Placing..." : `Place ${orderType} ${direction} order`}
          </button>
        </div>
      )}

      {/* Order list */}
      {orders.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          No pending orders. {!readOnly && "Create one to place limit/stop orders at key levels."}
        </div>
      ) : (
        <div className="space-y-1.5">
          {orders.map((order) => {
            const base = getBaseAsset(order.symbol);
            const currentPrice = prices[base] || 0;
            const distancePct = currentPrice > 0
              ? ((order.trigger_price - currentPrice) / currentPrice * 100)
              : 0;
            const absDistance = Math.abs(distancePct);
            const isClose = absDistance < 1;
            const isMedium = absDistance < 3;

            return (
              <div
                key={order._id}
                className="bg-slate-800/40 rounded-xl p-2.5 border border-white/[0.04] space-y-1.5"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      order.order_type === "limit"
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}>
                      {order.order_type.toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-bold ${
                      order.direction === "long" ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {order.direction.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-white font-bold">{order.symbol.replace("-PERP", "")}</span>
                    <span className="text-[10px] text-slate-500">{order.leverage}x</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-500">
                      Expires: {timeUntil(order.expires_at)}
                    </span>
                    {!readOnly && (
                      <button
                        onClick={() => handleCancel(order._id)}
                        className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                {/* Price info */}
                <div className="flex items-center gap-3 text-[10px]">
                  <div>
                    <span className="text-slate-500">Trigger: </span>
                    <span className="text-white font-mono font-bold">${formatPrice(order.trigger_price)}</span>
                  </div>
                  {currentPrice > 0 && (
                    <div>
                      <span className="text-slate-500">Current: </span>
                      <span className="text-slate-400 font-mono">${formatPrice(currentPrice)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-500">Size: </span>
                    <span className="text-slate-400 font-mono">${order.size_usd.toFixed(0)}</span>
                  </div>
                </div>

                {/* Distance bar */}
                {currentPrice > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isClose ? "bg-emerald-500" : isMedium ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.max(5, Math.min(100, 100 - absDistance * 10))}%` }}
                      />
                    </div>
                    <span className={`text-[9px] font-mono font-bold ${
                      isClose ? "text-emerald-400" : isMedium ? "text-amber-400" : "text-red-400"
                    }`}>
                      {distancePct >= 0 ? "+" : ""}{distancePct.toFixed(2)}%
                    </span>
                  </div>
                )}

                {/* SL/TP badges */}
                {(order.stop_loss || order.take_profit) && (
                  <div className="flex gap-2 text-[9px]">
                    {order.stop_loss && (
                      <span className="text-red-400">SL: ${formatPrice(order.stop_loss)}</span>
                    )}
                    {order.take_profit && (
                      <span className="text-emerald-400">TP: ${formatPrice(order.take_profit)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Info */}
      <div className="bg-slate-800/20 rounded-lg p-2.5 border border-white/[0.02]">
        <div className="text-[10px] text-slate-500 space-y-1">
          <p><strong className="text-slate-400">Limit orders:</strong> Trigger when price reaches your level (buy dips, sell rips).</p>
          <p><strong className="text-slate-400">Stop orders:</strong> Trigger on breakouts (buy above resistance, sell below support).</p>
          <p><strong className="text-slate-400">Checked every minute</strong> by the cron. Orders auto-expire after the set expiry.</p>
        </div>
      </div>
    </div>
  );
};

export default PerpPendingOrders;
