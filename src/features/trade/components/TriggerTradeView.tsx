import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  FaTimes,
  FaSync,
  FaChevronDown,
  FaArrowDown,
  FaArrowUp,
  FaSpinner,
  FaCheckCircle,
  FaTimesCircle,
} from "react-icons/fa";
import {
  ASSET_CONFIG,
  placeTrade,
  cancelOrder,
  fetchEnrichedPendingOrders,
  fetchTraderState,
  fetchSwyftxOrderHistory,
  type PortfolioAsset,
} from "../services/tradeApi";

type TriggerMode = "buy" | "sell" | null;

interface Props {
  assets: PortfolioAsset[];
  prices: Record<string, number>;
  usdcBalance: number;
  isAdmin: boolean;
  onClose: () => void;
}

const TriggerTradeView = ({
  assets,
  prices,
  usdcBalance,
  isAdmin,
  onClose,
}: Props) => {
  // Order form state
  const [mode, setMode] = useState<TriggerMode>(null);
  const [selectedCoin, setSelectedCoin] = useState("");
  const [showCoinPicker, setShowCoinPicker] = useState(false);
  const [coinSearch, setCoinSearch] = useState("");
  const [offsetPct, setOffsetPct] = useState(-5);
  const [amountPct, setAmountPct] = useState(0);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Pending orders + recently filled
  const [orders, setOrders] = useState<any[]>([]);
  const [filledOrders, setFilledOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Set default coin
  useEffect(() => {
    if (!selectedCoin && assets.length > 0) {
      const first = assets.find(
        (a) => a.code !== "AUD" && a.code !== "USDC",
      );
      if (first) setSelectedCoin(first.code);
    }
  }, [assets, selectedCoin]);

  // Load pending orders + recently filled
  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const [liveOrders, history] = await Promise.all([
        fetchEnrichedPendingOrders(prices),
        fetchSwyftxOrderHistory(10).catch(() => [] as any[]),
      ]);
      if (liveOrders.length > 0) {
        setOrders(liveOrders);
      } else {
        const state = await fetchTraderState();
        setOrders(state?.enrichedOrders || []);
      }
      // Show last 5 recently filled orders
      setFilledOrders(history.slice(0, 5));
    } catch {
      try {
        const state = await fetchTraderState();
        setOrders(state?.enrichedOrders || []);
      } catch {
        setOrders([]);
      }
    }
    setLoadingOrders(false);
  };

  useEffect(() => {
    loadOrders();
  }, []);

  // Derived values
  const currentPrice = prices[selectedCoin] || 0;
  const triggerPrice = currentPrice * (1 + offsetPct / 100);
  const availableUsdc = usdcBalance;
  const holdingAsset = assets.find((a) => a.code === selectedCoin);
  const holdingValue = holdingAsset ? holdingAsset.balance * currentPrice : 0;
  const maxAmount = mode === "buy" ? availableUsdc : holdingValue;
  const tradeAmount = maxAmount * (amountPct / 100);

  const filteredCoins = assets.filter(
    (a) =>
      a.code !== "AUD" &&
      a.code !== "USDC" &&
      (coinSearch === "" ||
        a.code.toLowerCase().includes(coinSearch.toLowerCase()) ||
        a.name.toLowerCase().includes(coinSearch.toLowerCase())),
  );

  const cfg = ASSET_CONFIG[selectedCoin] || {
    color: "#64748b",
    icon: selectedCoin,
    name: selectedCoin,
  };

  // Reset offset when mode changes
  const handleModeChange = (newMode: TriggerMode) => {
    setMode(newMode);
    setOffsetPct(newMode === "buy" ? -5 : 5);
    setAmountPct(0);
  };

  // Place trigger order
  const handleConfirm = async () => {
    if (!isAdmin || !selectedCoin || amountPct === 0 || !mode) return;
    setIsSubmitting(true);
    setShowError(null);

    try {
      const result = await placeTrade({
        assetCode: selectedCoin,
        side: mode,
        amount: tradeAmount,
        orderType: "limit",
        triggerPrice,
        currentPrice,
      });

      if (result.success) {
        setShowSuccess(true);
        setAmountPct(0);
        setTimeout(() => setShowSuccess(false), 2500);
        // Refresh orders after placing
        setTimeout(() => loadOrders(), 1500);
      } else {
        setShowError(result.error || "Order failed");
        setTimeout(() => setShowError(null), 4000);
      }
    } catch (err: any) {
      setShowError(err.message || "Network error");
      setTimeout(() => setShowError(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel order
  const handleCancel = async (orderUuid: string) => {
    if (!isAdmin) return;
    setCancellingId(orderUuid);
    const result = await cancelOrder(orderUuid);
    setCancellingId(null);
    if (result.success) {
      setOrders((prev) => prev.filter((o) => o.orderId !== orderUuid));
    }
  };

  // Reset form
  const handleReset = () => {
    setMode(null);
    setOffsetPct(-5);
    setAmountPct(0);
  };

  const formatPrice = (p: number) =>
    p >= 1
      ? `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `$${p.toFixed(4)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* ── Header ───────────────────────────────── */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.15)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12" y2="16" />
            </svg>
          </div>
          <div>
            <span className="text-base font-bold text-slate-200">
              Trigger Orders
            </span>
            <div className="text-[10px] text-slate-500">
              Buy the Dips & Sell the Rise
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && mode && (
            <button
              onClick={handleReset}
              className="text-[10px] font-bold text-amber-400 hover:text-amber-300 px-2 py-1 rounded-lg"
              style={{ background: "rgba(245,158,11,0.1)" }}
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <FaTimes size={14} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* ── Admin: Order Form ────────────────────── */}
      {isAdmin && (
        <div className="p-4 space-y-4 border-b border-white/[0.06]">
          {/* Mode buttons: Buy Dip / Sell Rise */}
          <div className="flex gap-2">
            <button
              onClick={() => handleModeChange("buy")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                mode === "buy"
                  ? "bg-green-500/20 text-green-400 border border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]"
                  : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-green-400"
              }`}
            >
              <FaArrowDown size={12} />
              + Buy Dip
            </button>
            <button
              onClick={() => handleModeChange("sell")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                mode === "sell"
                  ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                  : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-red-400"
              }`}
            >
              <FaArrowUp size={12} />
              - Sell Rise
            </button>
          </div>

          {/* Order form (shown when mode is selected) */}
          {mode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="space-y-4 overflow-hidden"
            >
              {/* Coin selector */}
              <div>
                <button
                  onClick={() => setShowCoinPicker(!showCoinPicker)}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-white/[0.06] bg-white/[0.03]"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: cfg.color }}
                    >
                      {selectedCoin.slice(0, 2)}
                    </div>
                    <span className="text-sm font-bold text-white">
                      {selectedCoin}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-slate-400">
                      {formatPrice(currentPrice)}
                    </span>
                    <FaChevronDown size={10} className="text-slate-500" />
                  </div>
                </button>

                {/* Dropdown */}
                {showCoinPicker && (
                  <div className="mt-1 rounded-xl border border-white/[0.06] bg-[#0a0a1a] p-2 max-h-40 overflow-y-auto">
                    <input
                      value={coinSearch}
                      onChange={(e) => setCoinSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full px-3 py-1.5 text-xs rounded-lg border bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 mb-1"
                    />
                    {filteredCoins.map((a) => (
                      <button
                        key={a.code}
                        onClick={() => {
                          setSelectedCoin(a.code);
                          setShowCoinPicker(false);
                          setCoinSearch("");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                          a.code === selectedCoin
                            ? "bg-amber-500/10 text-amber-400"
                            : "text-slate-400 hover:bg-white/5"
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{
                            backgroundColor:
                              ASSET_CONFIG[a.code]?.color || "#64748b",
                          }}
                        >
                          {a.code.slice(0, 2)}
                        </div>
                        <span className="font-bold">{a.code}</span>
                        <span className="ml-auto font-mono text-slate-600">
                          {formatPrice(prices[a.code] || 0)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Current price display with offset badge */}
              <div className="text-center py-2">
                <div className="text-2xl font-bold text-white font-mono">
                  {formatPrice(triggerPrice)}
                </div>
                <span
                  className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-lg ${
                    mode === "buy"
                      ? "bg-green-500/15 text-green-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {offsetPct > 0 ? "+" : ""}
                  {offsetPct}%
                </span>
              </div>

              {/* Price offset slider */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    Price
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {mode === "buy"
                      ? `${offsetPct}% below`
                      : `+${offsetPct}% above`}
                  </span>
                </div>
                <input
                  type="range"
                  min={mode === "buy" ? -30 : 1}
                  max={mode === "buy" ? -1 : 30}
                  value={offsetPct}
                  onChange={(e) => setOffsetPct(Number(e.target.value))}
                  className={`w-full ${mode === "buy" ? "accent-green-500" : "accent-red-500"}`}
                />
                <div className="flex justify-between mt-1 text-[10px] text-slate-600">
                  <span>{mode === "buy" ? "-30%" : "+1%"}</span>
                  <span>{mode === "buy" ? "-1%" : "+30%"}</span>
                </div>
              </div>

              {/* Amount slider */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    {mode === "buy" ? "USDC to spend" : "Amount to sell"}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    ({formatPrice(maxAmount)} available)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={amountPct}
                  onChange={(e) => setAmountPct(Number(e.target.value))}
                  className={`w-full ${mode === "buy" ? "accent-green-500" : "accent-red-500"}`}
                />
                <div className="flex justify-between mt-1">
                  {[0, 10, 25, 33, 50].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmountPct(v)}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                        amountPct === v
                          ? mode === "buy"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                          : "text-slate-600 hover:text-slate-400"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                {amountPct > 0 && (
                  <div className="text-center mt-2">
                    <span className="text-lg font-bold font-mono text-white">
                      {formatPrice(tradeAmount)}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm button */}
              <button
                onClick={handleConfirm}
                disabled={amountPct === 0 || isSubmitting}
                className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                  amountPct === 0
                    ? "bg-white/[0.04] text-slate-600 cursor-not-allowed"
                    : mode === "buy"
                      ? "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                      : "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                }`}
              >
                {isSubmitting ? (
                  <FaSpinner className="animate-spin mx-auto" size={16} />
                ) : (
                  `Confirm ${mode === "buy" ? "Buy" : "Sell"} Trigger`
                )}
              </button>

              {/* Success */}
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl bg-green-500/10 border border-green-500/20"
                >
                  <FaCheckCircle className="text-green-400" size={14} />
                  <span className="text-sm font-bold text-green-400">
                    Order Placed!
                  </span>
                </motion.div>
              )}

              {/* Error */}
              {showError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-center gap-2 py-2 rounded-xl bg-red-500/10 border border-red-500/20"
                >
                  <FaTimesCircle className="text-red-400" size={14} />
                  <span className="text-xs font-bold text-red-400">
                    {showError}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      )}

      {/* ── Pending Orders (visible to ALL users) ── */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#a855f7"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-sm font-bold text-slate-200">
              Pending Orders
            </span>
            {orders.length > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(168,85,247,0.2)",
                  color: "#a855f7",
                }}
              >
                {orders.length}
              </span>
            )}
          </div>
          <button
            onClick={loadOrders}
            disabled={loadingOrders}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <FaSync
              size={10}
              className={`text-slate-400 ${loadingOrders ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {!isAdmin && (
          <div
            className="text-[11px] text-slate-500 text-center mb-3 py-1.5 px-2.5 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)" }}
          >
            View only —{" "}
            {orders.length > 0
              ? `${orders.length} orders managed by pool admin`
              : "orders are managed by the pool admin"}
          </div>
        )}

        {loadingOrders ? (
          <div className="flex justify-center py-8">
            <div className="w-7 h-7 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center text-slate-500 text-xs py-5 rounded-xl border border-white/[0.04]">
            No pending orders
          </div>
        ) : (
          <div className="space-y-1.5" style={{ maxHeight: 400, overflowY: "auto" }}>
            {orders.map((order, i) => {
              // Handle both enriched string ("BTC") and server-state object ({ code: "BTC" })
              const rawAsset = order.asset;
              const asset =
                (typeof rawAsset === "object" && rawAsset?.code) ? rawAsset.code :
                rawAsset || order.primaryAsset || order.assetCode || "?";
              const buy = order.isBuy ?? order.type?.includes("BUY");
              const type =
                order.type ||
                (order.orderType === 3
                  ? "LIMIT BUY"
                  : order.orderType === 4
                    ? "LIMIT SELL"
                    : order.orderType === 5
                      ? "STOP BUY"
                      : order.orderType === 6
                        ? "STOP SELL"
                        : "ORDER");
              const trigger = parseFloat(order.trigger) || parseFloat(order.rate) || parseFloat(order.triggerPrice) || 0;
              // "amount" is USDC value; "quantity" is crypto token count — don't mix them
              const rawAmt = parseFloat(order.amount) || parseFloat(order.total) || 0;
              const rawQty = parseFloat(order.quantity) || 0;
              const amount = rawAmt || (rawQty > 0 && trigger > 0 ? rawQty * trigger : 0);
              const orderCurrentPrice = prices[asset] || order.currentPrice || 0;
              // Always calculate proximity at render time with live prices
              // (enrichment-time prices may be stale due to React closure)
              const proximity = orderCurrentPrice > 0 && trigger > 0
                ? Math.abs(orderCurrentPrice - trigger) / orderCurrentPrice * 100
                : 0;
              const orderCfg = ASSET_CONFIG[asset] || {
                color: "#64748b",
                icon: asset.charAt(0),
                name: asset,
              };
              const orderId = order.orderId || order.orderUuid || order.id;

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
                  key={orderId || i}
                  className="rounded-lg p-2.5"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    borderLeft: `3px solid ${buy ? "#22c55e" : "#ef4444"}`,
                  }}
                >
                  {/* Row 1: coin + type + proximity + amount + cancel */}
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: orderCfg.color }}>
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
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-300 font-mono">
                        ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => handleCancel(orderId)}
                          disabled={cancellingId === orderId}
                          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        >
                          {cancellingId === orderId ? (
                            <FaSpinner size={7} className="text-slate-500 animate-spin" />
                          ) : (
                            <FaTimes size={7} className="text-slate-500" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: proximity bar */}
                  <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ background: barColor, width: `${(progress * 100).toFixed(0)}%`, opacity: 0.8 }}
                    />
                  </div>

                  {/* Row 3: current / trigger prices */}
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-slate-500">Now {formatPrice(orderCurrentPrice)}</span>
                    <span className={buy ? "text-green-400/70" : "text-red-400/70"}>
                      Trigger {formatPrice(trigger)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Recently Filled Orders ── */}
        {filledOrders.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center gap-2 mb-2">
              <FaCheckCircle size={10} className="text-green-400/60" />
              <span className="text-[11px] font-bold text-slate-500">Recently Filled</span>
            </div>
            <div className="space-y-1">
              {filledOrders.map((filled, i) => {
                const fCoin = filled.coin || "?";
                const fCfg = ASSET_CONFIG[fCoin] || { color: "#64748b", icon: fCoin.charAt(0), name: fCoin };
                const fBuy = filled.type === "buy";
                const fAmount = Number(filled.amount) || 0;
                const fQty = Number(filled.quantity) || 0;
                const fTime = filled.timestamp ? new Date(filled.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                return (
                  <div
                    key={filled.swyftxId || i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.015)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold" style={{ color: fCfg.color }}>{fCoin}</span>
                      <span
                        className="text-[8px] font-bold px-1 py-0.5 rounded"
                        style={{
                          background: fBuy ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                          color: fBuy ? "#22c55e80" : "#ef444480",
                        }}
                      >
                        {fBuy ? "BOUGHT" : "SOLD"}
                      </span>
                      <span className="text-[9px] text-slate-600">{fTime}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {fQty > 0 ? `${fQty.toFixed(fQty >= 1 ? 2 : 4)} ` : ""}
                      ${fAmount > 0 ? fAmount.toFixed(2) : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TriggerTradeView;
