import { useState } from "react";
import { motion } from "motion/react";
import { FaTimes, FaSpinner, FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import { recordDeposit, AUD_TO_USD } from "../services/tradeApi";

interface Props {
  adminWallet: string;
  totalPoolValue: number;
  poolStats: { nav: number; totalShares?: number } | null;
  onClose: () => void;
  onSuccess: () => void;
}

const RecordDepositView = ({
  adminWallet,
  totalPoolValue,
  poolStats,
  onClose,
  onSuccess,
}: Props) => {
  const [currency, setCurrency] = useState<"AUD" | "USDC">("AUD");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
    shares?: number;
    nav?: number;
  } | null>(null);

  const rawAmount = parseFloat(amount) || 0;
  const amountUsd = currency === "AUD" ? rawAmount * AUD_TO_USD : rawAmount;

  // Preview: estimate shares that would be issued
  const currentNav = poolStats?.nav || 1;
  const estimatedShares = amountUsd > 0 ? amountUsd / currentNav : 0;

  const handleConfirm = async () => {
    if (amountUsd < 1 || isSubmitting) return;

    setIsSubmitting(true);
    setResult(null);

    const originalAmount = rawAmount;
    const res = await recordDeposit(adminWallet, amountUsd, totalPoolValue, currency);

    if (res.success) {
      const amountLabel = currency === "AUD"
        ? `A$${originalAmount.toFixed(2)} (≈ $${amountUsd.toFixed(2)} USD)`
        : `$${amountUsd.toFixed(2)} USDC`;
      setResult({
        type: "success",
        message: `${amountLabel} → ${res.shares?.toFixed(2)} shares at NAV $${res.nav?.toFixed(4)}`,
        shares: res.shares,
        nav: res.nav,
      });
      setAmount("");
      // Refresh parent data after a short delay
      setTimeout(() => onSuccess(), 1000);
    } else {
      setResult({ type: "error", message: res.error || "Failed" });
    }

    setIsSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-[10px] flex items-center justify-center"
            style={{ background: "rgba(34,197,94,0.15)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          </div>
          <div>
            <span className="text-base font-bold text-slate-200">Record Deposit</span>
            <div className="text-[10px] text-slate-500">Log your Swyftx bank transfer</div>
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

      {/* Form */}
      <div className="p-4 space-y-4">
        {/* Currency toggle */}
        <div className="flex gap-2">
          {(["AUD", "USDC"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                currency === c
                  ? c === "AUD"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-green-500/20 text-green-400 border border-green-500/40"
                  : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-slate-300"
              }`}
            >
              {c === "AUD" ? "A$ AUD" : "$ USDC"}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider text-slate-600">
              Amount deposited
            </span>
            <span className="text-[10px] text-slate-600">
              {currency === "AUD" ? "Australian Dollars" : "US Dollar Coin"}
            </span>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">
              {currency === "AUD" ? "A$" : "$"}
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full pl-10 pr-4 py-3 rounded-xl text-lg font-bold font-mono text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-700 focus:outline-none focus:border-green-500/40"
            />
          </div>
          {currency === "AUD" && rawAmount > 0 && (
            <div className="text-right mt-1 text-xs font-mono text-slate-500">
              ≈ ${amountUsd.toFixed(2)} USD
            </div>
          )}
        </div>

        {/* Preview */}
        {amountUsd > 0 && (
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-2">Preview</div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Current NAV</span>
              <span className="text-slate-300 font-mono">${currentNav.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Shares to issue</span>
              <span className="text-green-400 font-bold font-mono">{estimatedShares.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">USD value</span>
              <span className="text-slate-300 font-mono">${amountUsd.toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={amountUsd < 1 || isSubmitting}
          className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
            amountUsd < 1
              ? "bg-white/[0.04] text-slate-600 cursor-not-allowed"
              : "bg-green-500 text-white hover:bg-green-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          }`}
        >
          {isSubmitting ? (
            <FaSpinner className="animate-spin mx-auto" size={16} />
          ) : (
            `Record ${currency} Deposit`
          )}
        </button>

        {/* Result */}
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl ${
              result.type === "success"
                ? "bg-green-500/10 border border-green-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}
          >
            {result.type === "success" ? (
              <FaCheckCircle className="text-green-400" size={14} />
            ) : (
              <FaTimesCircle className="text-red-400" size={14} />
            )}
            <span className={`text-xs font-bold ${result.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {result.message}
            </span>
          </motion.div>
        )}

        {/* Info note */}
        <div className="text-[10px] text-slate-600 text-center leading-relaxed">
          Record after depositing AUD via PayID or USDC to Swyftx.
          Shares are calculated at current NAV to keep allocations fair.
        </div>
      </div>
    </motion.div>
  );
};

export default RecordDepositView;
