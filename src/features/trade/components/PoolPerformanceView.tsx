import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaTrash } from "react-icons/fa";
import { fetchDepositSummary, fetchDeposits, voidDeposit, type DepositRecord, type DepositSummary } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  adminWallet: string;
  totalPoolValue: number;
  onChanged?: () => void;
}

const fmtUsd = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return `${sign}$${a.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const PoolPerformanceView = ({ isOpen, onClose, adminWallet, totalPoolValue, onChanged }: Props) => {
  const [summary, setSummary] = useState<DepositSummary | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, d] = await Promise.all([
      fetchDepositSummary(adminWallet),
      fetchDeposits(adminWallet),
    ]);
    setSummary(s);
    setDeposits(d);
    setLoading(false);
  }, [adminWallet]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleVoid = async (txHash: string, amount: number) => {
    if (!confirm(`Void this ${fmtUsd(amount)} deposit? It will reverse the shares it minted. This can't be undone from the UI.`)) return;
    setVoiding(txHash);
    const res = await voidDeposit(adminWallet, txHash);
    setVoiding(null);
    if (!res.success) {
      alert(`Void failed: ${res.error}`);
      return;
    }
    await load();
    onChanged?.();
  };

  const deposited = summary?.totalDeposited ?? 0;
  const profit = totalPoolValue - deposited;
  const profitPct = deposited > 0 ? (profit / deposited) * 100 : 0;
  const profitColor = profit > 0 ? "#22c55e" : profit < 0 ? "#ef4444" : "#94a3b8";

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
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20 mx-auto w-full max-w-[460px]"
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                      <path d="M3 3v18h18" />
                      <path d="M7 14l4-4 3 3 5-6" />
                    </svg>
                  </div>
                  <span className="text-base font-bold text-slate-200">Pool Performance</span>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <>
                  {/* Summary tiles */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <Tile label="Deposited" value={fmtUsd(deposited)} color="#22c55e" />
                    <Tile label="Current Value" value={fmtUsd(totalPoolValue)} color="#67e8f9" />
                    <Tile label="Profit" value={fmtUsd(profit)} sub={`${profit >= 0 ? "+" : ""}${profitPct.toFixed(1)}%`} color={profitColor} />
                  </div>
                  <div className="text-[10px] text-slate-600 text-center mb-4">
                    {summary?.count ?? deposits.filter((d) => d.status !== "voided").length} active deposit{(summary?.count ?? 0) !== 1 ? "s" : ""} · current value is live from Swyftx
                  </div>

                  {/* Deposit list */}
                  <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-2">Deposit history</div>
                  <div className="space-y-1.5">
                    {deposits.map((d) => {
                      const voided = d.status === "voided";
                      return (
                        <div
                          key={d.txHash}
                          className="flex items-center justify-between rounded-lg px-3 py-2"
                          style={{
                            background: voided ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${voided ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`,
                            opacity: voided ? 0.45 : 1,
                          }}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[13px] font-bold font-mono ${voided ? "text-slate-500 line-through" : "text-slate-200"}`}>
                                {fmtUsd(d.amount)}
                              </span>
                              <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}>
                                {d.currency}
                              </span>
                              {voided && <span className="text-[8px] font-bold text-red-400/80">VOIDED</span>}
                            </div>
                            <div className="text-[9px] text-slate-600 font-mono">
                              {new Date(d.timestamp).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                              {" · "}{d.shares?.toFixed(1)} shares
                            </div>
                          </div>
                          {!voided && (
                            <button
                              onClick={() => handleVoid(d.txHash, d.amount)}
                              disabled={voiding === d.txHash}
                              className="flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg transition-all"
                              style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}
                            >
                              <FaTrash size={9} />
                              {voiding === d.txHash ? "…" : "Void"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[9px] text-slate-600 text-center mt-4 leading-relaxed">
                    Voiding reverses the shares a deposit minted and excludes it from totals.
                    Use it to remove accidental duplicates. Soft-deleted (kept for audit).
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const Tile = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) => (
  <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 text-center">
    <div className="text-[9px] text-slate-500 font-semibold tracking-wider mb-1">{label}</div>
    <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
    {sub && <div className="text-[10px] font-bold font-mono mt-0.5" style={{ color }}>{sub}</div>}
  </div>
);

export default PoolPerformanceView;
