import { useState } from "react";
import type { PerpPosition } from "../../types/perps";
import {
  partialClosePosition,
  pyramidPosition,
  flipPosition,
  setPositionType,
} from "../../services/perpApi";

interface Props {
  positions: PerpPosition[];
  onClose: (positionId: string, exitPrice: number) => void;
  onModify: (positionId: string) => void;
  onRefresh?: () => void;
  readOnly?: boolean;
  wallet?: string;
}

const PerpPositionsList = ({ positions, onClose, onModify, onRefresh, readOnly = false, wallet }: Props) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [closePct, setClosePct] = useState(50);
  const [pyramidSize, setPyramidSize] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-xs">
        No open positions. Place a paper trade to get started.
      </div>
    );
  }

  const handlePartialClose = async (pos: PerpPosition) => {
    if (!wallet) return;
    try {
      setActionLoading(`partial-${pos._id}`);
      setActionError(null);
      await partialClosePosition(pos._id, pos.mark_price, closePct, wallet);
      setExpandedId(null);
      onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to partial close");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePyramid = async (pos: PerpPosition) => {
    if (!wallet) return;
    const size = pyramidSize || Math.round(pos.size_usd * 0.5);
    try {
      setActionLoading(`pyramid-${pos._id}`);
      setActionError(null);
      await pyramidPosition(pos._id, size, pos.mark_price, wallet);
      setExpandedId(null);
      onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to pyramid");
    } finally {
      setActionLoading(null);
    }
  };

  const handleFlip = async (pos: PerpPosition) => {
    if (!wallet) return;
    try {
      setActionLoading(`flip-${pos._id}`);
      setActionError(null);
      await flipPosition(pos._id, pos.mark_price, wallet);
      setExpandedId(null);
      onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to flip");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetType = async (pos: PerpPosition, type: "core" | "satellite") => {
    if (!wallet) return;
    try {
      setActionLoading(`type-${pos._id}`);
      setActionError(null);
      await setPositionType(pos._id, type, wallet);
      onRefresh?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to set type");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      {positions.map((pos) => {
        const pnlColor = pos.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
        const dirColor = pos.direction === "long" ? "text-emerald-400" : "text-red-400";
        const dirBg = pos.direction === "long" ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20";
        const pnlSign = pos.unrealized_pnl >= 0 ? "+" : "";
        const isExpanded = expandedId === pos._id;
        const posType = pos.position_type || "satellite";

        return (
          <div key={pos._id} className="bg-slate-800/40 rounded-xl border border-white/[0.04] p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{pos.symbol}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${dirBg} ${dirColor}`}>
                  {pos.direction.toUpperCase()} {pos.leverage}x
                </span>
                {/* Position type badge */}
                <span className={`text-[9px] px-1 py-0.5 rounded border ${
                  posType === "core"
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    : "bg-slate-700/40 text-slate-500 border-white/[0.04]"
                }`}>
                  {posType === "core" ? "CORE" : "SAT"}
                </span>
                {/* Strategy label — extracted from entry_reason "[strategy_name] signal..." */}
                {pos.entry_reason && (() => {
                  const match = pos.entry_reason.match(/^\[([^\]]+)\]/);
                  if (!match) return null;
                  const strat = match[1];
                  const STRAT_LABELS: Record<string, { label: string; color: string }> = {
                    ninja: { label: "NINJA", color: "bg-purple-500/15 text-purple-400 border-purple-500/25" },
                    trend_following: { label: "TREND", color: "bg-blue-500/15 text-blue-400 border-blue-500/25" },
                    mean_reversion: { label: "MEAN REV", color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/25" },
                    momentum: { label: "MOMENTUM", color: "bg-orange-500/15 text-orange-400 border-orange-500/25" },
                    scalping: { label: "SCALP", color: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25" },
                    keltner: { label: "KELTNER", color: "bg-teal-500/15 text-teal-400 border-teal-500/25" },
                    bb_squeeze: { label: "SQUEEZE", color: "bg-pink-500/15 text-pink-400 border-pink-500/25" },
                    grid: { label: "GRID", color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25" },
                    zone_recovery: { label: "ZONE REC", color: "bg-rose-500/15 text-rose-400 border-rose-500/25" },
                    hf_scalper: { label: "HF", color: "bg-lime-500/15 text-lime-400 border-lime-500/25" },
                    sr_reversal: { label: "S/R REV", color: "bg-violet-500/15 text-violet-400 border-violet-500/25" },
                  };
                  const s = STRAT_LABELS[strat] || { label: strat.toUpperCase(), color: "bg-slate-500/15 text-slate-400 border-slate-500/25" };
                  return (
                    <span className={`text-[9px] px-1 py-0.5 rounded border ${s.color}`} title={pos.entry_reason}>
                      {s.label}
                    </span>
                  );
                })()}
                {/* Pyramid level */}
                {pos.pyramid_level && pos.pyramid_level > 0 && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    P{pos.pyramid_level}
                  </span>
                )}
              </div>
              <div className={`text-sm font-bold ${pnlColor}`}>
                {pnlSign}${pos.unrealized_pnl.toFixed(2)}
                <span className="text-[10px] ml-1">({pnlSign}{pos.unrealized_pnl_pct.toFixed(2)}%)</span>
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
              <div>
                <span className="text-slate-500">Entry</span>
                <div className="text-slate-300">${pos.entry_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Mark</span>
                <div className="text-white font-medium">${pos.mark_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Liq.</span>
                <div className="text-red-400">${pos.liquidation_price.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
              </div>
              <div>
                <span className="text-slate-500">Size</span>
                <div className="text-slate-300">${pos.size_usd.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-slate-500">Margin</span>
                <div className="text-slate-300">${pos.margin.toFixed(2)}</div>
              </div>
              <div>
                <span className="text-slate-500">Fees</span>
                <div className="text-amber-400">${pos.total_fees.toFixed(2)}</div>
              </div>
            </div>

            {/* SL/TP indicators */}
            {(pos.stop_loss || pos.take_profit || pos.trailing_stop_price) && (
              <div className="flex gap-2 text-[10px] mb-2">
                {pos.stop_loss && (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                    SL: ${pos.stop_loss.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
                {pos.take_profit && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    TP: ${pos.take_profit.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
                {pos.trailing_stop_price && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Trail: ${pos.trailing_stop_price.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                  </span>
                )}
              </div>
            )}

            {/* Actions — hidden in read-only mode */}
            {!readOnly && (
              <>
                <div className="flex gap-1.5 mb-1.5">
                  <button
                    onClick={() => onModify(pos._id)}
                    className="flex-1 text-[10px] py-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-white transition-colors border border-white/[0.04]"
                  >
                    Modify
                  </button>
                  <button
                    onClick={() => onClose(pos._id, pos.mark_price)}
                    className="flex-1 text-[10px] py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20"
                  >
                    Close
                  </button>
                </div>

                {/* Advanced actions row */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : pos._id)}
                    className="flex-1 text-[9px] py-1 rounded bg-white/[0.03] text-slate-500 hover:text-slate-300 transition-colors border border-white/[0.03]"
                  >
                    {isExpanded ? "Less" : "More"}
                  </button>
                  {wallet && (
                    <>
                      <button
                        onClick={() => handleSetType(pos, posType === "core" ? "satellite" : "core")}
                        disabled={actionLoading === `type-${pos._id}`}
                        className="text-[9px] py-1 px-2 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors border border-amber-500/20 disabled:opacity-40"
                      >
                        {actionLoading === `type-${pos._id}` ? "..." : posType === "core" ? "Satellite" : "Core"}
                      </button>
                      <button
                        onClick={() => handleFlip(pos)}
                        disabled={actionLoading === `flip-${pos._id}`}
                        className="text-[9px] py-1 px-2 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors border border-purple-500/20 disabled:opacity-40"
                      >
                        {actionLoading === `flip-${pos._id}` ? "..." : "Flip"}
                      </button>
                    </>
                  )}
                </div>

                {/* Expanded actions panel */}
                {isExpanded && wallet && (
                  <div className="mt-2 space-y-2 p-2 rounded-lg bg-slate-900/50 border border-white/[0.04]">
                    {actionError && (
                      <div className="text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1 border border-red-500/20">
                        {actionError}
                        <button onClick={() => setActionError(null)} className="ml-1 text-slate-500">x</button>
                      </div>
                    )}

                    {/* Partial Close */}
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Partial Close</div>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="range"
                          min={10}
                          max={90}
                          step={10}
                          value={closePct}
                          onChange={(e) => setClosePct(Number(e.target.value))}
                          className="flex-1 h-1 accent-red-400"
                        />
                        <span className="text-[10px] text-slate-300 w-8 text-right">{closePct}%</span>
                        <button
                          onClick={() => handlePartialClose(pos)}
                          disabled={actionLoading === `partial-${pos._id}`}
                          className="text-[10px] py-1 px-2 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20 disabled:opacity-40"
                        >
                          {actionLoading === `partial-${pos._id}` ? "..." : `Close ${closePct}%`}
                        </button>
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        Closes ${(pos.size_usd * closePct / 100).toFixed(2)} of ${pos.size_usd.toFixed(2)}
                      </div>
                    </div>

                    {/* Pyramid (only if in profit) */}
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">
                        Pyramid (Add to Position)
                        {pos.unrealized_pnl < 0 && (
                          <span className="ml-1 text-red-400 normal-case">- needs profit</span>
                        )}
                      </div>
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="number"
                          placeholder={`$${Math.round(pos.size_usd * 0.5)}`}
                          value={pyramidSize || ""}
                          onChange={(e) => setPyramidSize(Number(e.target.value))}
                          className="flex-1 bg-slate-800 border border-white/[0.06] rounded px-2 py-1 text-[10px] text-white placeholder-slate-600"
                        />
                        <button
                          onClick={() => handlePyramid(pos)}
                          disabled={actionLoading === `pyramid-${pos._id}` || pos.unrealized_pnl < 0}
                          className="text-[10px] py-1 px-2 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 disabled:opacity-40"
                        >
                          {actionLoading === `pyramid-${pos._id}` ? "..." : "Add"}
                        </button>
                      </div>
                      <div className="text-[9px] text-slate-600 mt-0.5">
                        Max 3 pyramid levels. Each level 50% of previous size.
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PerpPositionsList;
