import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaSpinner, FaCheckCircle, FaTimesCircle, FaTrash } from "react-icons/fa";
import {
  fetchWalletCashFlows,
  recordWalletCashFlow,
  deleteWalletCashFlow,
  type WalletCashFlows,
} from "../services/tradeApi";

interface WalletOption {
  walletAddress: string;
  walletShort: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  adminWallet: string;
  wallets: WalletOption[];
  onChanged: () => void;
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const CashFlowAdminView = ({ isOpen, onClose, adminWallet, wallets, onChanged }: Props) => {
  const [selectedWallet, setSelectedWallet] = useState("");
  const [flowType, setFlowType] = useState<"deposit" | "withdrawal">("deposit");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [existing, setExisting] = useState<WalletCashFlows | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Default to the first known wallet once the list loads / view opens.
  useEffect(() => {
    if (isOpen && !selectedWallet && wallets.length > 0) {
      setSelectedWallet(wallets[0].walletAddress);
    }
  }, [isOpen, wallets, selectedWallet]);

  const loadExisting = useCallback(async (wallet: string) => {
    if (!wallet) {
      setExisting(null);
      return;
    }
    setLoadingExisting(true);
    setExisting(await fetchWalletCashFlows(wallet));
    setLoadingExisting(false);
  }, []);

  useEffect(() => {
    if (isOpen && selectedWallet) loadExisting(selectedWallet);
  }, [isOpen, selectedWallet, loadExisting]);

  const amountUsd = parseFloat(amount) || 0;

  const handleSubmit = async () => {
    if (!selectedWallet || amountUsd <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    setResult(null);

    const res = await recordWalletCashFlow(
      adminWallet,
      selectedWallet,
      flowType,
      amountUsd,
      undefined,
      note.trim() || undefined,
    );

    if (res.success) {
      setResult({ type: "success", message: `Recorded ${fmtUsd(amountUsd)} ${flowType}` });
      setAmount("");
      setNote("");
      await loadExisting(selectedWallet);
      onChanged();
    } else {
      setResult({ type: "error", message: res.error || "Failed" });
    }

    setIsSubmitting(false);
  };

  const handleDelete = async (flowId: string, amountUsdValue: number, type: string) => {
    if (!confirm(`Delete this ${fmtUsd(amountUsdValue)} ${type} entry?`)) return;
    setDeletingId(flowId);
    const res = await deleteWalletCashFlow(adminWallet, flowId);
    setDeletingId(null);
    if (!res.success) {
      alert(`Delete failed: ${res.error}`);
      return;
    }
    await loadExisting(selectedWallet);
    onChanged();
  };

  const walletLabel = (addr: string) =>
    wallets.find((w) => w.walletAddress === addr)?.walletShort || `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20 mx-auto w-full max-w-[460px] md:max-w-2xl md:rounded-t-3xl"
          >
            <div className="p-4 md:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-base md:text-lg font-bold text-slate-200">Cash Flow Totals</span>
                    <div className="text-[10px] text-slate-500">Record lifetime deposited/withdrawn per wallet</div>
                  </div>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              {/* Wallet selector */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Wallet</div>
                {wallets.length > 0 ? (
                  <select
                    value={selectedWallet}
                    onChange={(e) => setSelectedWallet(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono text-white bg-white/[0.04] border border-white/[0.08] focus:outline-none focus:border-blue-500/40"
                  >
                    {wallets.map((w) => (
                      <option key={w.walletAddress} value={w.walletAddress} className="bg-[#0a0a1a]">
                        {w.walletShort} {w.walletAddress === adminWallet ? "(you)" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={selectedWallet}
                    onChange={(e) => setSelectedWallet(e.target.value)}
                    placeholder="Wallet address"
                    className="w-full px-3 py-2.5 rounded-xl text-sm font-mono text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-700 focus:outline-none focus:border-blue-500/40"
                  />
                )}
              </div>

              {/* Type toggle */}
              <div className="flex gap-2 mb-3">
                {(["deposit", "withdrawal"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFlowType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all capitalize ${
                      flowType === t
                        ? t === "deposit"
                          ? "bg-green-500/20 text-green-400 border border-green-500/40"
                          : "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-white/[0.04] text-slate-500 border border-white/[0.06] hover:text-slate-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Amount */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Amount (USD)</div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-3 rounded-xl text-lg font-bold font-mono text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-700 focus:outline-none focus:border-blue-500/40"
                  />
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Enter the wallet's lifetime total in USD (convert AUD yourself before entering) —
                  this is typically recorded once as a running total, not line-by-line.
                </div>
              </div>

              {/* Note */}
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 mb-1">Note (optional)</div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. lifetime total as of Oct 2026"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-700 focus:outline-none focus:border-blue-500/40"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={!selectedWallet || amountUsd <= 0 || isSubmitting}
                className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all ${
                  !selectedWallet || amountUsd <= 0
                    ? "bg-white/[0.04] text-slate-600 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                }`}
              >
                {isSubmitting ? (
                  <FaSpinner className="animate-spin mx-auto" size={16} />
                ) : (
                  `Record ${flowType}`
                )}
              </button>

              {result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`flex items-center justify-center gap-2 mt-3 py-2.5 rounded-xl ${
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

              {/* Existing entries for this wallet */}
              <div className="mt-6">
                <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-2">
                  {selectedWallet ? `Recorded for ${walletLabel(selectedWallet)}` : "Recorded entries"}
                </div>
                {loadingExisting ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  </div>
                ) : existing && existing.flows.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-center">
                        <div className="text-[10px] text-slate-500 font-semibold tracking-wider mb-1">DEPOSITED</div>
                        <div className="text-sm font-bold font-mono text-green-400">{fmtUsd(existing.totalDepositedUsd)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-center">
                        <div className="text-[10px] text-slate-500 font-semibold tracking-wider mb-1">WITHDRAWN</div>
                        <div className="text-sm font-bold font-mono text-amber-400">{fmtUsd(existing.totalWithdrawnUsd)}</div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {[...existing.flows]
                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                        .map((f) => (
                          <div
                            key={f.id}
                            className="flex items-center justify-between gap-2 rounded-lg bg-slate-800/30 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold capitalize ${f.type === "deposit" ? "text-green-400" : "text-amber-400"}`}>
                                  {f.type}
                                </span>
                                <span className="text-xs font-mono text-slate-300">{fmtUsd(f.amountUsd)}</span>
                              </div>
                              <div className="text-[10px] text-slate-600 truncate">
                                {fmtDateTime(f.timestamp)}{f.note ? ` · ${f.note}` : ""}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDelete(f.id, f.amountUsd, f.type)}
                              disabled={deletingId === f.id}
                              className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              {deletingId === f.id ? (
                                <FaSpinner className="animate-spin" size={11} />
                              ) : (
                                <FaTrash size={11} />
                              )}
                            </button>
                          </div>
                        ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-3 text-[11px] text-slate-500 text-center">
                    No entries recorded yet for this wallet.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CashFlowAdminView;
