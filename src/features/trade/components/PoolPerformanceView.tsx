import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaTrash } from "react-icons/fa";
import { fetchDepositSummary, voidDeposit, type DepositRecord } from "../services/tradeApi";

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
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const PoolPerformanceView = ({ isOpen, onClose, adminWallet, totalPoolValue, onChanged }: Props) => {
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [deposited, setDeposited] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [voiding, setVoiding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await fetchDepositSummary(adminWallet);
    setDeposits(s?.deposits ?? []);
    setDeposited(s?.totalDeposited ?? 0);
    setCount(s?.count ?? 0);
    setLoading(false);
  }, [adminWallet]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleVoid = async (txHash: string, amount: number) => {
    if (!confirm(`Void this ${fmtUsd(amount)} deposit? It reverses the shares it minted. (Soft-deleted, kept for audit.)`)) return;
    setVoiding(txHash);
    const res = await voidDeposit(adminWallet, txHash);
    setVoiding(null);
    if (!res.success) { alert(`Void failed: ${res.error}`); return; }
    await load();
    onChanged?.();
  };

  const profit = totalPoolValue - deposited;
  const profitPct = deposited > 0 ? (profit / deposited) * 100 : 0;
  const profitColor = profit > 0 ? "#22c55e" : profit < 0 ? "#ef4444" : "#94a3b8";

  // Cumulative-deposited area chart model (oldest → newest, excluding voided)
  const chart = useMemo(() => {
    const active = deposits
      .filter((d) => d.status !== "voided")
      .map((d) => ({ ms: new Date(d.timestamp).getTime(), amount: d.amount }))
      .filter((d) => !isNaN(d.ms))
      .sort((a, b) => a.ms - b.ms);
    if (active.length < 2) return null;
    let cum = 0;
    const pts = active.map((d) => ({ ms: d.ms, cum: (cum += d.amount) }));
    const tMin = pts[0].ms;
    const tMax = Math.max(pts[pts.length - 1].ms, Date.now());
    const tSpan = tMax - tMin || 1;
    const yMax = Math.max(pts[pts.length - 1].cum, totalPoolValue) * 1.05 || 1;
    const x = (ms: number) => ((ms - tMin) / tSpan) * 100;
    const y = (v: number) => (1 - v / yMax) * 100;
    // step path for cumulative deposits
    let dPath = `0,${y(0).toFixed(2)}`;
    let prev = 0;
    for (const p of pts) { dPath += ` ${x(p.ms).toFixed(2)},${y(prev).toFixed(2)} ${x(p.ms).toFixed(2)},${y(p.cum).toFixed(2)}`; prev = p.cum; }
    dPath += ` 100,${y(prev).toFixed(2)}`;
    const area = `0,100 ${dPath} 100,100`;
    return { line: dPath, area, valueY: y(totalPoolValue), finalDeposited: prev, tMin, tMax };
  }, [deposits, totalPoolValue]);

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
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20 mx-auto w-full max-w-[460px] md:max-w-4xl md:rounded-t-3xl"
          >
            <div className="p-4 md:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(34,197,94,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                      <path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" />
                    </svg>
                  </div>
                  <span className="text-base md:text-lg font-bold text-slate-200">Pool Performance</span>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-2 border-green-500 border-t-transparent animate-spin" /></div>
              ) : (
                <>
                  {/* Summary tiles */}
                  <div className="grid grid-cols-3 gap-2 md:gap-3 mb-2">
                    <Tile label="Deposited" value={fmtUsd(deposited)} color="#22c55e" />
                    <Tile label="Current Value" value={fmtUsd(totalPoolValue)} color="#67e8f9" />
                    <Tile label="Profit" value={fmtUsd(profit)} sub={`${profit >= 0 ? "+" : ""}${profitPct.toFixed(1)}%`} color={profitColor} />
                  </div>
                  <div className="text-[10px] text-slate-600 text-center md:text-left mb-4">
                    {count} active deposit{count !== 1 ? "s" : ""} · current value is live from Swyftx
                  </div>

                  {/* Cumulative-deposited chart vs current value */}
                  {chart && (
                    <div className="mb-5">
                      <div className="flex items-center gap-3 mb-1.5 text-[9px] text-slate-500">
                        <span className="flex items-center gap-1"><span className="w-3 h-1 rounded" style={{ background: "#22c55e" }} /> Cumulative deposited</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-px" style={{ borderTop: "1px dashed #67e8f9" }} /> Current value</span>
                      </div>
                      <div className="relative w-full rounded-lg overflow-hidden" style={{ height: 150, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <span className="absolute right-1.5 top-1 text-[9px] font-mono text-slate-600 z-10">{fmtUsd(Math.max(chart.finalDeposited, totalPoolValue))}</span>
                        <span className="absolute left-1.5 bottom-1 text-[9px] font-mono text-slate-600 z-10">{fmtDate(new Date(chart.tMin).toISOString())}</span>
                        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <polygon points={chart.area} fill="rgba(34,197,94,0.12)" />
                          <polyline points={chart.line} fill="none" stroke="#22c55e" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                          <line x1="0" y1={chart.valueY} x2="100" y2={chart.valueY} stroke="#67e8f9" strokeWidth="0.7" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                        </svg>
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] uppercase tracking-wider text-slate-600 font-bold mb-2">Deposit history</div>

                  {/* MOBILE: cards */}
                  <div className="md:hidden space-y-1.5">
                    {deposits.map((d) => <DepositCard key={d.txHash} d={d} voiding={voiding} onVoid={handleVoid} />)}
                  </div>

                  {/* DESKTOP: table */}
                  <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-slate-500" style={{ background: "rgba(255,255,255,0.03)" }}>
                          <th className="px-3 py-2.5 text-left font-bold">Date</th>
                          <th className="px-3 py-2.5 text-right font-bold">Amount</th>
                          <th className="px-3 py-2.5 text-center font-bold">Currency</th>
                          <th className="px-3 py-2.5 text-right font-bold">Shares</th>
                          <th className="px-3 py-2.5 text-right font-bold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deposits.map((d, i) => {
                          const voided = d.status === "voided";
                          return (
                            <tr key={d.txHash} style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)", opacity: voided ? 0.45 : 1 }}>
                              <td className="px-3 py-2.5 text-left font-mono text-xs text-slate-400">{fmtDateTime(d.timestamp)}</td>
                              <td className={`px-3 py-2.5 text-right font-mono font-bold ${voided ? "text-slate-500 line-through" : "text-slate-200"}`}>{fmtUsd(d.amount)}</td>
                              <td className="px-3 py-2.5 text-center"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}>{d.currency}</span></td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">{d.shares?.toFixed(1)}</td>
                              <td className="px-3 py-2.5 text-right">
                                {voided ? <span className="text-[9px] font-bold text-red-400/70">VOIDED</span> : (
                                  <button onClick={() => handleVoid(d.txHash, d.amount)} disabled={voiding === d.txHash}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg"
                                    style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>
                                    <FaTrash size={8} />{voiding === d.txHash ? "…" : "Void"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[9px] text-slate-600 text-center mt-4 leading-relaxed">
                    Deposited / Profit are based on <b>your</b> deposits ({adminWallet.slice(0, 4)}…{adminWallet.slice(-4)}). Voiding reverses a deposit's shares and excludes it from totals (kept for audit).
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
  <div className="rounded-xl border border-slate-700/30 bg-slate-800/40 p-2.5 md:p-4 text-center">
    <div className="text-[9px] md:text-[10px] text-slate-500 font-semibold tracking-wider mb-1">{label}</div>
    <div className="text-sm md:text-xl font-bold font-mono" style={{ color }}>{value}</div>
    {sub && <div className="text-[10px] md:text-sm font-bold font-mono mt-0.5" style={{ color }}>{sub}</div>}
  </div>
);

const DepositCard = ({ d, voiding, onVoid }: { d: DepositRecord; voiding: string | null; onVoid: (tx: string, amt: number) => void }) => {
  const voided = d.status === "voided";
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2"
      style={{ background: voided ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.03)", border: `1px solid ${voided ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.06)"}`, opacity: voided ? 0.45 : 1 }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] font-bold font-mono ${voided ? "text-slate-500 line-through" : "text-slate-200"}`}>{fmtUsd(d.amount)}</span>
          <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}>{d.currency}</span>
          {voided && <span className="text-[8px] font-bold text-red-400/80">VOIDED</span>}
        </div>
        <div className="text-[9px] text-slate-600 font-mono">{fmtDateTime(d.timestamp)} · {d.shares?.toFixed(1)} shares</div>
      </div>
      {!voided && (
        <button onClick={() => onVoid(d.txHash, d.amount)} disabled={voiding === d.txHash}
          className="flex items-center gap-1 text-[10px] font-bold px-2 py-1.5 rounded-lg"
          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.25)" }}>
          <FaTrash size={9} />{voiding === d.txHash ? "…" : "Void"}
        </button>
      )}
    </div>
  );
};

export default PoolPerformanceView;
