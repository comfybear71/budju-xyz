import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaBolt,
  FaBullseye,
  FaRobot,
  FaExchangeAlt,
  FaChevronDown,
  FaLock,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import type { PortfolioAsset } from "../services/tradeApi";
import { ASSET_CONFIG, placeTrade } from "../services/tradeApi";

type OrderType = "instant" | "trigger" | "auto";
type Side = "buy" | "sell";

interface Props {
  assets: PortfolioAsset[];
  prices: Record<string, number>;
  selectedAsset: string;
  usdcBalance: number;
  onSelectAsset: (code: string) => void;
  isAdmin: boolean;
  onClose: () => void;
}

const TradePanel = ({
  assets,
  prices,
  selectedAsset,
  usdcBalance,
  onSelectAsset,
  isAdmin,
  onClose,
}: Props) => {
  const { isDarkMode } = useTheme();
  const [orderType, setOrderType] = useState<OrderType>("instant");
  const [side, setSide] = useState<Side>("buy");
  const [amountPct, setAmountPct] = useState(0);
  const [triggerOffset, setTriggerOffset] = useState(0);
  const [showCoinPicker, setShowCoinPicker] = useState(false);
  const [coinSearch, setCoinSearch] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const asset = assets.find((a) => a.code === selectedAsset);
  const price = prices[selectedAsset] || asset?.priceUsd || 0;
  const cfg = ASSET_CONFIG[selectedAsset] || {
    color: "#64748b",
    icon: selectedAsset,
    name: selectedAsset,
  };

  // Calculate amounts
  const availableBalance = side === "buy" ? usdcBalance : (asset?.balance || 0) * price;
  const tradeAmount = availableBalance * (amountPct / 100);
  const cryptoQty = price > 0 ? tradeAmount / price : 0;
  const effectivePrice =
    orderType === "trigger" ? price * (1 + triggerOffset / 100) : price;

  const filteredAssets = assets.filter(
    (a) =>
      a.code !== "AUD" &&
      a.code !== "USDC" &&
      (coinSearch === "" ||
        a.code.toLowerCase().includes(coinSearch.toLowerCase()) ||
        a.name.toLowerCase().includes(coinSearch.toLowerCase())),
  );

  const handleTrade = () => {
    if (!isAdmin) return;
    setShowConfirm(true);
  };

  const confirmTrade = async () => {
    setShowConfirm(false);
    setIsSubmitting(true);
    setShowError(null);

    try {
      const result = await placeTrade({
        assetCode: selectedAsset,
        side,
        amount: tradeAmount,
        orderType: orderType === "trigger" ? "limit" : "market",
        triggerPrice: orderType === "trigger" ? effectivePrice : undefined,
      });

      if (result.success) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setAmountPct(0);
        }, 2500);
      } else {
        setShowError(result.error || "Trade failed — check Swyftx connection");
        setTimeout(() => setShowError(null), 4000);
      }
    } catch (err: any) {
      setShowError(err.message || "Network error — trade not placed");
      setTimeout(() => setShowError(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={`rounded-xl border overflow-hidden ${
        isDarkMode
          ? "bg-[#0c0c20]/80 border-white/[0.06]"
          : "bg-white/80 border-gray-200/40"
      } backdrop-blur-sm`}
    >
      {/* Header with coin selector */}
      <div
        className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-white/[0.06]" : "border-gray-100"}`}
      >
        <button
          onClick={() => setShowCoinPicker(!showCoinPicker)}
          className="flex items-center gap-2"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: cfg.color }}
          >
            {selectedAsset.slice(0, 2)}
          </div>
          <span
            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {selectedAsset}
          </span>
          <FaChevronDown
            size={10}
            className={isDarkMode ? "text-gray-500" : "text-gray-400"}
          />
        </button>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
          >
            ${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <button
            onClick={onClose}
            className={`text-xs px-2 py-1 rounded ${isDarkMode ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-700"}`}
          >
            Close
          </button>
        </div>
      </div>

      {/* Coin picker dropdown */}
      <AnimatePresence>
        {showCoinPicker && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div
              className={`p-3 border-b ${isDarkMode ? "border-white/[0.06]" : "border-gray-100"}`}
            >
              <input
                value={coinSearch}
                onChange={(e) => setCoinSearch(e.target.value)}
                placeholder="Search coins..."
                className={`w-full px-3 py-2 text-xs rounded-lg border ${isDarkMode ? "bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600" : "bg-gray-50 border-gray-200 text-gray-900"}`}
              />
              <div className="mt-2 max-h-32 overflow-y-auto space-y-0.5">
                {filteredAssets.map((a) => (
                  <button
                    key={a.code}
                    onClick={() => {
                      onSelectAsset(a.code);
                      setShowCoinPicker(false);
                      setCoinSearch("");
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                      a.code === selectedAsset
                        ? "bg-budju-blue/10 text-budju-blue"
                        : isDarkMode
                          ? "text-gray-400 hover:bg-white/5"
                          : "text-gray-600 hover:bg-gray-50"
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
                    <span
                      className={`ml-auto font-mono ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                    >
                      ${(prices[a.code] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4 space-y-4">
        {/* Order type selector */}
        <div className="flex gap-1">
          {(
            [
              ["instant", "Instant", FaBolt],
              ["trigger", "Trigger", FaBullseye],
              ["auto", "Auto", FaRobot],
            ] as const
          ).map(([type, label, Icon]) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                orderType === type
                  ? "bg-gradient-to-r from-budju-pink to-budju-blue text-white"
                  : isDarkMode
                    ? "bg-white/[0.04] text-gray-500 hover:text-white"
                    : "bg-gray-50 text-gray-400 hover:text-gray-700"
              }`}
            >
              <Icon size={10} /> {label}
            </button>
          ))}
        </div>

        {/* Buy/Sell toggle (instant) */}
        {orderType === "instant" && (
          <div className="flex gap-1">
            <button
              onClick={() => setSide("buy")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                side === "buy"
                  ? "bg-green-500/20 text-green-400 border border-green-500/30"
                  : isDarkMode
                    ? "bg-white/[0.04] text-gray-500"
                    : "bg-gray-50 text-gray-400"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setSide("sell")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                side === "sell"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : isDarkMode
                    ? "bg-white/[0.04] text-gray-500"
                    : "bg-gray-50 text-gray-400"
              }`}
            >
              Sell
            </button>
          </div>
        )}

        {/* Amount slider */}
        <div>
          <div className="flex justify-between mb-1">
            <span
              className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Amount ({amountPct}%)
            </span>
            <span
              className={`text-xs font-mono ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              ${tradeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={amountPct}
            onChange={(e) => setAmountPct(Number(e.target.value))}
            className="w-full accent-budju-pink"
          />
          <div className="flex justify-between mt-1">
            {[0, 25, 50, 75, 100].map((v) => (
              <button
                key={v}
                onClick={() => setAmountPct(v)}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                  amountPct === v
                    ? "bg-budju-pink/20 text-budju-pink"
                    : isDarkMode
                      ? "text-gray-600 hover:text-gray-400"
                      : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/* Trigger offset (trigger mode) */}
        {orderType === "trigger" && (
          <div>
            <div className="flex justify-between mb-1">
              <span
                className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
              >
                Trigger ({triggerOffset > 0 ? "+" : ""}
                {triggerOffset}%)
              </span>
              <span
                className={`text-xs font-mono ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                $
                {effectivePrice.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              value={triggerOffset}
              onChange={(e) => setTriggerOffset(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div
              className={`text-[10px] text-center ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
            >
              {triggerOffset < 0
                ? `Buy when price drops ${Math.abs(triggerOffset)}%`
                : triggerOffset > 0
                  ? `Sell when price rises ${triggerOffset}%`
                  : "Set trigger offset"}
            </div>
          </div>
        )}

        {/* Auto mode info */}
        {orderType === "auto" && (
          <div
            className={`p-3 rounded-lg border text-center ${isDarkMode ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}
          >
            <FaRobot
              className={`mx-auto mb-2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              size={20}
            />
            <p
              className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              Auto-trader executes tier-based strategies automatically. Configure
              deviation and allocation per tier in the admin panel.
            </p>
          </div>
        )}

        {/* Conversion display */}
        {amountPct > 0 && orderType !== "auto" && (
          <div
            className={`flex items-center justify-center gap-2 text-xs p-2 rounded-lg ${isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"}`}
          >
            <span className={isDarkMode ? "text-gray-400" : "text-gray-600"}>
              {side === "buy"
                ? `$${tradeAmount.toFixed(2)} USDC`
                : `${cryptoQty.toFixed(6)} ${selectedAsset}`}
            </span>
            <FaExchangeAlt
              size={10}
              className={isDarkMode ? "text-gray-600" : "text-gray-400"}
            />
            <span
              className={`font-bold ${side === "buy" ? "text-green-400" : "text-red-400"}`}
            >
              {side === "buy"
                ? `${cryptoQty.toFixed(6)} ${selectedAsset}`
                : `$${tradeAmount.toFixed(2)} USDC`}
            </span>
          </div>
        )}

        {/* Trade button */}
        {!isAdmin ? (
          <div
            className={`text-center py-3 rounded-xl text-xs font-bold ${isDarkMode ? "bg-white/[0.04] text-gray-500" : "bg-gray-100 text-gray-400"}`}
          >
            <FaLock className="inline mr-1" size={10} /> Admin only — view your
            holdings below
          </div>
        ) : (
          <button
            onClick={handleTrade}
            disabled={amountPct === 0 || orderType === "auto"}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
              amountPct === 0 || orderType === "auto"
                ? isDarkMode
                  ? "bg-white/[0.04] text-gray-600 cursor-not-allowed"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                : side === "buy"
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-red-500 text-white hover:bg-red-600"
            }`}
          >
            {orderType === "instant"
              ? `${side === "buy" ? "Buy" : "Sell"} ${selectedAsset}`
              : `Place ${triggerOffset < 0 ? "Buy Dip" : "Sell Rise"} Order`}
          </button>
        )}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl"
          >
            <div
              className={`p-5 rounded-xl border max-w-xs w-full mx-4 ${isDarkMode ? "bg-[#0a0a1a] border-white/[0.08]" : "bg-white border-gray-200"}`}
            >
              <h3
                className={`font-bold text-sm mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                Confirm {side === "buy" ? "Buy" : "Sell"}
              </h3>
              <div className="space-y-1 text-xs mb-4">
                <div className="flex justify-between">
                  <span className={isDarkMode ? "text-gray-500" : "text-gray-400"}>
                    Asset
                  </span>
                  <span className={isDarkMode ? "text-white" : "text-gray-900"}>
                    {selectedAsset}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? "text-gray-500" : "text-gray-400"}>
                    Amount
                  </span>
                  <span className={isDarkMode ? "text-white" : "text-gray-900"}>
                    ${tradeAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? "text-gray-500" : "text-gray-400"}>
                    Receive
                  </span>
                  <span
                    className={`font-bold ${side === "buy" ? "text-green-400" : "text-red-400"}`}
                  >
                    {cryptoQty.toFixed(6)} {selectedAsset}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold ${isDarkMode ? "bg-white/10 text-white" : "bg-gray-200 text-gray-700"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTrade}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold text-white ${side === "buy" ? "bg-green-500" : "bg-red-500"}`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submitting */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl"
          >
            <div className="text-center">
              <FaSpinner className="text-blue-400 mx-auto animate-spin" size={32} />
              <p className="text-white font-bold mt-2 text-sm">Placing order...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl"
          >
            <div className="text-center">
              <FaCheckCircle className="text-green-400 mx-auto" size={40} />
              <p className="text-white font-bold mt-2">Order Placed!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {showError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl"
          >
            <div className="text-center px-4">
              <FaTimesCircle className="text-red-400 mx-auto" size={40} />
              <p className="text-white font-bold mt-2">Trade Failed</p>
              <p className="text-red-400 text-xs mt-1">{showError}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default TradePanel;
