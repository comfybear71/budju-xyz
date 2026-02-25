import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaBolt,
  FaExchangeAlt,
  FaChevronDown,
  FaTimes,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
} from "react-icons/fa";
import type { PortfolioAsset } from "../services/tradeApi";
import { ASSET_CONFIG, placeTrade } from "../services/tradeApi";

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
  const [side, setSide] = useState<Side>("buy");
  const [amountPct, setAmountPct] = useState(0);
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
        orderType: "market",
        currentPrice: price,
      });

      if (result.success) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setAmountPct(0);
        }, 2500);
      } else {
        setShowError(result.error || "Trade failed");
        setTimeout(() => setShowError(null), 4000);
      }
    } catch (err: any) {
      setShowError(err.message || "Network error");
      setTimeout(() => setShowError(null), 4000);
    } finally {
      setIsSubmitting(false);
    }
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
      className="relative rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.15)" }}
          >
            <FaBolt size={14} className="text-blue-400" />
          </div>
          <div>
            <span className="text-base font-bold text-slate-200">Instant Trade</span>
            <div className="text-[10px] text-slate-500">Market order at current price</div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <FaTimes size={14} className="text-slate-400" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Coin selector ── */}
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
                {selectedAsset.slice(0, 2)}
              </div>
              <span className="text-sm font-bold text-white">{selectedAsset}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-slate-400">
                {formatPrice(price)}
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
                      ? "bg-blue-500/10 text-blue-400"
                      : "text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: ASSET_CONFIG[a.code]?.color || "#64748b" }}
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

        {/* ── Buy / Sell toggle ── */}
        <div className="flex gap-2">
          <button
            onClick={() => { setSide("buy"); setAmountPct(0); }}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              side === "buy"
                ? "bg-green-500/20 text-green-400 border border-green-500/40 shadow-[0_0_15px_rgba(34,197,94,0.15)]"
                : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-green-400"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => { setSide("sell"); setAmountPct(0); }}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
              side === "sell"
                ? "bg-red-500/20 text-red-400 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-red-400"
            }`}
          >
            Sell
          </button>
        </div>

        {/* ── Amount slider ── */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-600">
              Amount
            </span>
            <span className="text-xs font-mono text-slate-400">
              ({formatPrice(availableBalance)} available)
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={amountPct}
            onChange={(e) => setAmountPct(Number(e.target.value))}
            className={`w-full ${side === "buy" ? "accent-green-500" : "accent-red-500"}`}
          />
          <div className="flex justify-between mt-1">
            {[0, 10, 25, 33, 50].map((v) => (
              <button
                key={v}
                onClick={() => setAmountPct(v)}
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                  amountPct === v
                    ? side === "buy"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/* ── Conversion display ── */}
        {amountPct > 0 && (
          <div className="flex items-center justify-center gap-2 text-xs p-2.5 rounded-lg bg-white/[0.03]">
            <span className="text-slate-400">
              {side === "buy"
                ? `$${tradeAmount.toFixed(2)} USDC`
                : `${cryptoQty.toFixed(6)} ${selectedAsset}`}
            </span>
            <FaExchangeAlt size={10} className="text-slate-600" />
            <span className={`font-bold ${side === "buy" ? "text-green-400" : "text-red-400"}`}>
              {side === "buy"
                ? `${cryptoQty.toFixed(6)} ${selectedAsset}`
                : `$${tradeAmount.toFixed(2)} USDC`}
            </span>
          </div>
        )}

        {/* ── Trade button ── */}
        <button
          onClick={handleTrade}
          disabled={amountPct === 0 || !isAdmin}
          className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
            amountPct === 0
              ? "bg-white/[0.04] text-slate-600 cursor-not-allowed"
              : side === "buy"
                ? "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                : "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          }`}
        >
          {side === "buy" ? "Buy" : "Sell"} {selectedAsset}
        </button>
      </div>

      {/* ── Confirm modal ── */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30 rounded-xl"
          >
            <div className="p-5 rounded-xl border bg-[#0a0a1a] border-white/[0.08] max-w-xs w-full mx-4">
              <h3 className="font-bold text-sm mb-3 text-white">
                Confirm {side === "buy" ? "Buy" : "Sell"}
              </h3>
              <div className="space-y-1 text-xs mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-500">Asset</span>
                  <span className="text-white">{selectedAsset}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount</span>
                  <span className="text-white">${tradeAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">{side === "buy" ? "Receive" : "Sell"}</span>
                  <span className={`font-bold ${side === "buy" ? "text-green-400" : "text-red-400"}`}>
                    {cryptoQty.toFixed(6)} {selectedAsset}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold bg-white/10 text-white"
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

      {/* ── Submitting ── */}
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

      {/* ── Success ── */}
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

      {/* ── Error ── */}
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
