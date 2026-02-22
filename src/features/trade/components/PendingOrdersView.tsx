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

  const getAsset = (o: any): string => {
    // Handle both enriched string ("BTC") and server-state object ({ code: "BTC" })
    const raw = o.asset;
    return String((typeof raw === "object" && raw?.code) ? raw.code :
      raw || o.primaryAsset || o.assetCode || o.primary_asset || "?");
  };

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
    parseFloat(o.trigger) || parseFloat(o.rate) || parseFloat(o.triggerPrice) || parseFloat(o.trigger_price) || 0;

  const getAmount = (o: any): number => {
    // "amount"/"total" = USDC value; "quantity" = crypto token count — don't mix them
    const rawAmt = parseFloat(o.amount) || parseFloat(o.total) || 0;
    if (rawAmt > 0) return rawAmt;
    const rawQty = parseFloat(o.quantity) || 0;
    const trig = getTrigger(o);
    return rawQty > 0 && trig > 0 ? rawQty * trig : 0;
  };

  const getProximity = (o: any): number => {
    // Always calculate from live prices (enrichment-time values may be stale)
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
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20"
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

              {/* Orders list — compact cards, scrollable */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-5">
                  No pending orders
                </div>
              ) : (
                <div className="space-y-1.5">
                  {orders.map((order, i) => {
                    const asset = getAsset(order);
                    const buy = isBuy(order);
                    const type = getType(order);
                    const trigger = getTrigger(order);
                    const amount = getAmount(order);
                    const proximity = getProximity(order);
                    const currentPrice = prices[asset] || 0;
                    const cfg = ASSET_CONFIG[asset] || { color: "#64748b", icon: asset.charAt(0), name: asset };

                    // Proximity bar: fills MORE when CLOSER to target
                    const progress = Math.min(1, Math.max(0.05, 1 - proximity / 20));
                    // Color: green/blue = close to target, orange/red = far away
                    let barColor: string;
                    if (proximity <= 2) barColor = "#22c55e";       // green — very close
                    else if (proximity <= 5) barColor = "#3b82f6";  // blue — close
                    else if (proximity <= 10) barColor = "#f97316"; // orange — moderate
                    else barColor = "#ef4444";                      // red — far away

                    return (
                      <div
                        key={order.orderId || order.orderUuid || order.id || i}
                        className="rounded-lg p-2.5"
                        style={{
                          background: "rgba(255,255,255,0.02)",
                          border: `1px solid rgba(255,255,255,0.04)`,
                          borderLeft: `3px solid ${buy ? "#22c55e" : "#ef4444"}`,
                        }}
                      >
                        {/* Row 1: coin + type badge + proximity + trigger price */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold" style={{ color: cfg.color }}>
                              {asset}
                            </span>
                            <span
                              className="text-[9px] font-bold px-1 py-0.5 rounded"
                              style={{
                                background: buy ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                                color: buy ? "#22c55e" : "#ef4444",
                              }}
                            >
                              {type}
                            </span>
                            <span className="text-[9px] font-bold" style={{ color: buy ? "#22c55e" : "#ef4444" }}>
                              {proximity.toFixed(1)}%
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-300 font-mono">
                            ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                        </div>

                        {/* Row 2: proximity bar */}
                        <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              background: barColor,
                              width: `${(progress * 100).toFixed(0)}%`,
                              opacity: 0.8,
                            }}
                          />
                        </div>

                        {/* Row 3: current / trigger prices */}
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-slate-500">
                            Now ${currentPrice.toLocaleString(undefined, { maximumFractionDigits: currentPrice >= 1 ? 2 : 4 })}
                          </span>
                          <span className={buy ? "text-green-400/70" : "text-red-400/70"}>
                            Trigger ${trigger.toLocaleString(undefined, { maximumFractionDigits: trigger >= 1 ? 2 : 4 })}
                          </span>
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
