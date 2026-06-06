import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaChevronDown, FaChevronRight, FaFire, FaTrophy, FaTint } from "react-icons/fa";
import { fetchCoinStats, ASSET_CONFIG, type CoinStat, type CoinStatsResponse } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prices: Record<string, number>;
}

type SortKey = "pnl" | "trades" | "accumulated";

// Per-coin row enriched with live-price-derived figures
interface Row extends CoinStat {
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPct: number;
  totalPnL: number;
  totalTrades: number;
}

const fmtPrice = (n: number | null | undefined) => {
  if (n == null || isNaN(n) || n === 0) return "—";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
};

const fmtUsd = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1000) return `${sign}$${a.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return `${sign}$${a.toFixed(2)}`;
};

const fmtQty = (n: number) => {
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toPrecision(4);
};

const CoinStatsView = ({ isOpen, onClose, prices }: Props) => {
  const [data, setData] = useState<CoinStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchCoinStats().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [isOpen]);

  const rows = useMemo<Row[]>(() => {
    if (!data?.coins) return [];
    const enriched = data.coins.map((c) => {
      const currentPrice = Number(prices[c.coin]) || 0;
      const marketValue = c.qtyHeld > 0 ? c.qtyHeld * currentPrice : 0;
      const unrealizedPnL =
        c.qtyHeld > 0 && c.avgCost > 0 && currentPrice > 0
          ? (currentPrice - c.avgCost) * c.qtyHeld
          : 0;
      const unrealizedPct =
        c.avgCost > 0 && currentPrice > 0 ? (currentPrice / c.avgCost - 1) * 100 : 0;
      return {
        ...c,
        currentPrice,
        marketValue,
        unrealizedPnL,
        unrealizedPct,
        totalPnL: c.realizedPnL + unrealizedPnL,
        totalTrades: c.buys + c.sells,
      };
    });
    const sorted = [...enriched];
    if (sortKey === "pnl") sorted.sort((a, b) => b.totalPnL - a.totalPnL);
    else if (sortKey === "trades") sorted.sort((a, b) => b.totalTrades - a.totalTrades);
    else sorted.sort((a, b) => b.marketValue - a.marketValue);
    return sorted;
  }, [data, prices, sortKey]);

  // Hero highlights
  const hero = useMemo(() => {
    if (rows.length === 0) return null;
    const mostTraded = rows.reduce((m, r) => (r.totalTrades > m.totalTrades ? r : m), rows[0]);
    const best = rows.reduce((m, r) => (r.totalPnL > m.totalPnL ? r : m), rows[0]);
    const worst = rows.reduce((m, r) => (r.totalPnL < m.totalPnL ? r : m), rows[0]);
    return { mostTraded, best, worst };
  }, [rows]);

  const fundingTotal = useMemo(
    () => (data?.funding || []).reduce((s, f) => s + (f.spent || 0), 0),
    [data],
  );

  const SortChip = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => setSortKey(k)}
      className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all"
      style={{
        background: sortKey === k ? "rgba(20,184,166,0.2)" : "rgba(255,255,255,0.04)",
        color: sortKey === k ? "#2dd4bf" : "#64748b",
        border: `1px solid ${sortKey === k ? "rgba(20,184,166,0.4)" : "rgba(255,255,255,0.06)"}`,
      }}
    >
      {label}
    </button>
  );

  const HeroCard = ({
    icon,
    label,
    row,
    valueColor,
  }: {
    icon: React.ReactNode;
    label: string;
    row: Row;
    valueColor: string;
  }) => (
    <div
      className="flex-shrink-0 rounded-xl p-2.5 snap-start"
      style={{ width: 120, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">{label}</span>
      </div>
      <div className="text-[13px] font-bold" style={{ color: ASSET_CONFIG[row.coin]?.color || "#e2e8f0" }}>
        {row.coin}
      </div>
      <div className="text-[10px] font-bold font-mono" style={{ color: valueColor }}>
        {label === "Most traded" ? `${row.totalTrades} trades` : fmtUsd(row.totalPnL)}
      </div>
    </div>
  );

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
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(20,184,166,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="2">
                      <path d="M3 3v18h18" />
                      <rect x="7" y="11" width="3" height="6" />
                      <rect x="12" y="7" width="3" height="10" />
                      <rect x="17" y="13" width="3" height="4" />
                    </svg>
                  </div>
                  <span className="text-base font-bold text-slate-200">Coin Stats</span>
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
                </div>
              ) : !data || rows.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No trade data yet. Per-coin stats appear here once the auto-trader has executed trades.
                </div>
              ) : (
                <>
                  {/* Summary line */}
                  <div className="text-[10px] text-slate-500 text-center mb-3">
                    {data.totalTrades.toLocaleString()} trades across {data.coinCount} coins
                    {fundingTotal > 0 && <> · {fmtUsd(fundingTotal)} converted to USDC</>}
                  </div>

                  {/* Hero strip */}
                  {hero && (
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-1 px-1 snap-x" style={{ scrollbarWidth: "thin" }}>
                      <HeroCard icon={<FaFire size={10} color="#f97316" />} label="Most traded" row={hero.mostTraded} valueColor="#f97316" />
                      <HeroCard icon={<FaTrophy size={10} color="#22c55e" />} label="Best" row={hero.best} valueColor="#22c55e" />
                      <HeroCard icon={<FaTint size={10} color="#ef4444" />} label="Biggest bleeder" row={hero.worst} valueColor="#ef4444" />
                    </div>
                  )}

                  {/* Sort chips */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Sort</span>
                    <SortChip k="pnl" label="P&L" />
                    <SortChip k="trades" label="Trades" />
                    <SortChip k="accumulated" label="Held" />
                  </div>

                  {/* Coin cards */}
                  <div className="space-y-1.5">
                    {rows.map((r) => {
                      const cfg = ASSET_CONFIG[r.coin] || { color: "#64748b" };
                      const pnlColor = r.totalPnL > 0 ? "#22c55e" : r.totalPnL < 0 ? "#ef4444" : "#64748b";
                      const isOpen2 = expanded === r.coin;
                      return (
                        <div
                          key={r.coin}
                          className="rounded-lg overflow-hidden"
                          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          {/* Card head — tap to expand */}
                          <button
                            onClick={() => setExpanded(isOpen2 ? null : r.coin)}
                            className="w-full flex items-center justify-between px-3 py-2.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isOpen2 ? <FaChevronDown size={9} className="text-slate-600" /> : <FaChevronRight size={9} className="text-slate-600" />}
                              <span className="text-[13px] font-bold" style={{ color: cfg.color }}>{r.coin}</span>
                              <span className="text-[9px] text-slate-500">{r.totalTrades} trades</span>
                              {r.costBasisPartial && (
                                <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}>
                                  PARTIAL
                                </span>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-[12px] font-bold font-mono" style={{ color: pnlColor }}>
                                {fmtUsd(r.totalPnL)}
                              </div>
                              <div className="text-[9px] font-mono text-slate-500">
                                {fmtUsd(r.marketValue)} held
                              </div>
                            </div>
                          </button>

                          {/* Detail */}
                          {isOpen2 && (
                            <div className="px-3 pb-3 pt-1 grid grid-cols-2 gap-x-3 gap-y-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                              <Stat label="Buys / Sells" value={`${r.buys} / ${r.sells}`} />
                              <Stat label="Trades / week" value={r.tradesPerWeek ? r.tradesPerWeek.toString() : "—"} />
                              <Stat label="Avg cost" value={fmtPrice(r.avgCost)} />
                              <Stat label="Current" value={fmtPrice(r.currentPrice)} />
                              <Stat label="Cheapest buy" value={fmtPrice(r.cheapestBuy)} color="#22c55e" />
                              <Stat label="Dearest buy" value={fmtPrice(r.dearestBuy)} color="#ef4444" />
                              <Stat label="Lowest sell" value={fmtPrice(r.cheapestSell)} color="#f97316" />
                              <Stat label="Highest sell" value={fmtPrice(r.dearestSell)} color="#22c55e" />
                              <Stat label="Qty held" value={fmtQty(r.qtyHeld)} />
                              <Stat label="Held value" value={fmtUsd(r.marketValue)} />
                              <Stat label="Total spent" value={fmtUsd(r.spent)} />
                              <Stat label="Total received" value={fmtUsd(r.received)} />
                              <Stat
                                label="Realised P&L"
                                value={fmtUsd(r.realizedPnL)}
                                color={r.realizedPnL > 0 ? "#22c55e" : r.realizedPnL < 0 ? "#ef4444" : undefined}
                              />
                              <Stat
                                label="Unrealised P&L"
                                value={`${fmtUsd(r.unrealizedPnL)} (${r.unrealizedPct > 0 ? "+" : ""}${r.unrealizedPct.toFixed(1)}%)`}
                                color={r.unrealizedPnL > 0 ? "#22c55e" : r.unrealizedPnL < 0 ? "#ef4444" : undefined}
                              />
                              {r.costBasisPartial && (
                                <div className="col-span-2 text-[9px] text-amber-500/80 mt-1">
                                  ⚠ Some of this coin was transferred in from an outside wallet, so cost basis &amp; P&L are partial.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="text-[9px] text-slate-600 text-center mt-3">
                    Read-only · realised P&L from sells, unrealised from live prices · avg-cost method
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

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] text-slate-500">{label}</span>
    <span className="text-[10px] font-bold font-mono" style={{ color: color || "#cbd5e1" }}>{value}</span>
  </div>
);

export default CoinStatsView;
