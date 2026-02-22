import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaSync } from "react-icons/fa";
import { fetchTraderState, fetchEnrichedPendingOrders, ASSET_CONFIG } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prices: Record<string, number>;
}

const PendingOrdersView = ({ isOpen, onClose, prices }: Props) => {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    setLoading(true);
    try {
      // Try live Swyftx orders first (enriched with current prices)
      const liveOrders = await fetchEnrichedPendingOrders(prices);
      if (liveOrders.length > 0) {
        setOrders(liveOrders);
      } else {
        // Fall back to cached enrichedOrders from server state
        const state = await fetchTraderState();
        setOrders(state?.enrichedOrders || []);
      }
    } catch {
      // Fall back to server state on error
      const state = await fetchTraderState();
      setOrders(state?.enrichedOrders || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadOrders();
  }, [isOpen]);

  const getAsset = (o: any): string =>
    o.asset || o.primaryAsset || o.assetCode || o.primary_asset || "?";

  const getType = (o: any): string => {
    if (o.type) return String(o.type).replace(/_/g, " ");
    if (o.orderType) {
      if (typeof o.orderType === "number") {
        const m: Record<number, string> = { 3: "LIMIT BUY", 4: "LIMIT SELL", 5: "STOP BUY", 6: "STOP SELL" };
        return m[o.orderType] || "ORDER";
      }
      return String(o.orderType).replace(/_/g, " ");
    }
    return "ORDER";
  };

  const isBuy = (o: any): boolean => getType(o).toUpperCase().includes("BUY");

  const getTrigger = (o: any): number =>
    Number(o.triggerPrice || o.trigger || o.rate || 0);

  const getAmount = (o: any): number =>
    Number(o.amount || o.total || 0);

  const getProximity = (o: any): number => {
    if (o.proximity != null) return Number(o.proximity);
    const asset = getAsset(o);
    const current = prices[asset] || 0;
    const trigger = getTrigger(o);
    if (current <= 0 || trigger <= 0) return 0;
    return Math.abs(current - trigger) / current * 100;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto"
            style={{ maxWidth: 420, margin: "0 auto" }}
          >
            <div className="p-4">
              {/* Header — matches FLUB userPendingModal */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(168,85,247,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <span className="text-base font-bold text-slate-200">Pending Orders</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadOrders()}
                    disabled={loading}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <FaSync size={10} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <FaTimes size={14} className="text-slate-400" />
                  </button>
                </div>
              </div>

              {/* View-only notice + order count */}
              <div className="text-[11px] text-slate-500 text-center mb-3 py-1.5 px-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                View only — {orders.length > 0 ? `${orders.length} orders managed by pool admin` : "orders are managed by the pool admin"}
              </div>

              {/* Orders list */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-5">
                  No pending orders
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {orders.map((order, i) => {
                    const asset = getAsset(order);
                    const buy = isBuy(order);
                    const type = getType(order);
                    const trigger = getTrigger(order);
                    const amount = getAmount(order);
                    const proximity = getProximity(order);
                    const currentPrice = prices[asset] || 0;
                    const cfg = ASSET_CONFIG[asset] || { color: "#64748b", icon: asset.charAt(0), name: asset };

                    return (
                      <div
                        key={order.orderId || order.orderUuid || order.id || i}
                        className="rounded-xl overflow-hidden"
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          borderLeft: `3px solid ${buy ? "#22c55e" : "#ef4444"}`,
                        }}
                      >
                        <div className="p-3">
                          {/* Top row: coin + type + trigger price */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                style={{ background: cfg.color }}
                              >
                                {(cfg.icon || asset.charAt(0)).slice(0, 2)}
                              </div>
                              <span className="text-sm font-bold text-slate-200">{asset}</span>
                              <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  background: buy ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                  color: buy ? "#22c55e" : "#ef4444",
                                }}
                              >
                                {type}
                              </span>
                            </div>
                            <span className="text-sm font-bold text-white font-mono">
                              ${trigger.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                            </span>
                          </div>

                          {/* Amount + proximity */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] text-slate-400 font-mono">
                              ${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
                            </span>
                            <span
                              className="text-[11px] font-bold"
                              style={{ color: buy ? "#22c55e" : "#ef4444" }}
                            >
                              {proximity.toFixed(1)}% away
                            </span>
                          </div>

                          {/* Proximity bar */}
                          <div className="h-1 rounded-full overflow-hidden mb-2" style={{ background: "rgba(255,255,255,0.06)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                background: buy
                                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                                  : "linear-gradient(90deg, #ef4444, #f87171)",
                                width: `${Math.min(100, Math.max(5, 100 - proximity * 5))}%`,
                              }}
                            />
                          </div>

                          {/* Current + trigger prices */}
                          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                            <span>Now: ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                            <span>Trigger: ${trigger.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PendingOrdersView;
