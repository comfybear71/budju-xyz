import { useState, useEffect, useMemo, Fragment } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaChevronDown, FaChevronRight, FaFire, FaTrophy, FaTint, FaSort, FaSortUp, FaSortDown } from "react-icons/fa";
import { fetchCoinStats, fetchCoinTrades, ASSET_CONFIG, type CoinStat, type CoinStatsResponse, type CoinTradePoint } from "../services/tradeApi";
import CoinTradeChart from "./CoinTradeChart";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prices: Record<string, number>;
}

type SortKey = "coin" | "trades" | "avgCost" | "current" | "realized" | "unrealized" | "pnl" | "held";
type SortDir = "asc" | "desc";

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

const pnlColor = (n: number) => (n > 0 ? "#22c55e" : n < 0 ? "#ef4444" : "#64748b");

const CoinStatsView = ({ isOpen, onClose, prices }: Props) => {
  const [data, setData] = useState<CoinStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("pnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(30);
  // undefined = not fetched, null = loading, array = loaded
  const [tradePoints, setTradePoints] = useState<Record<string, CoinTradePoint[] | null>>({});

  // Lazy-load a coin's individual trades when its row is expanded (for the chart)
  useEffect(() => {
    if (!expanded || tradePoints[expanded] !== undefined) return;
    setTradePoints((prev) => ({ ...prev, [expanded]: null }));
    fetchCoinTrades(expanded).then((res) => {
      setTradePoints((prev) => ({ ...prev, [expanded]: res?.trades || [] }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchCoinStats().then((d) => {
      setData(d);
      setLoading(false);
      setCountdown(30);
    });
  }, [isOpen]);

  // Auto-refresh trade-history stats every 30s while open (prices update live regardless)
  useEffect(() => {
    if (!isOpen) return;
    const refresh = setInterval(() => {
      fetchCoinStats(true).then((d) => {
        if (d) setData(d);
        setCountdown(30);
      });
    }, 30_000);
    const tick = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1_000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [isOpen]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(k);
      setSortDir(k === "coin" ? "asc" : "desc");
    }
  };

  const rows = useMemo<Row[]>(() => {
    if (!data?.coins) return [];
    const enriched = data.coins.map((c) => {
      const currentPrice = Number(prices[c.coin]) || 0;
      const marketValue = c.qtyHeld > 0 ? c.qtyHeld * currentPrice : 0;
      const unrealizedPnL =
        c.qtyHeld > 0 && c.avgCost > 0 && currentPrice > 0 ? (currentPrice - c.avgCost) * c.qtyHeld : 0;
      const unrealizedPct = c.avgCost > 0 && currentPrice > 0 ? (currentPrice / c.avgCost - 1) * 100 : 0;
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
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Row): number | string => {
      switch (sortKey) {
        case "coin": return r.coin;
        case "trades": return r.totalTrades;
        case "avgCost": return r.avgCost;
        case "current": return r.currentPrice;
        case "realized": return r.realizedPnL;
        case "unrealized": return r.unrealizedPnL;
        case "held": return r.marketValue;
        default: return r.totalPnL;
      }
    };
    return [...enriched].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return (va - vb) * dir;
    });
  }, [data, prices, sortKey, sortDir]);

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

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <FaSort size={8} className="text-slate-600" /> : sortDir === "desc" ? <FaSortDown size={8} className="text-teal-400" /> : <FaSortUp size={8} className="text-teal-400" />;

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
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20 mx-auto w-full max-w-[440px] md:max-w-6xl md:rounded-t-3xl"
          >
            <div className="p-4 md:p-6">
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
                  <span className="text-base md:text-lg font-bold text-slate-200">Coin Stats</span>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
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
                  <div className="flex items-center justify-center md:justify-between gap-2 text-[10px] md:text-xs text-slate-500 mb-3">
                    <span>
                      {data.totalTrades.toLocaleString()} trades across {data.coinCount} coins
                      {fundingTotal > 0 && <> · {fmtUsd(fundingTotal)} converted to USDC</>}
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap text-slate-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                      live · refresh {countdown}s
                    </span>
                  </div>

                  {/* Hero strip */}
                  {hero && (
                    <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4">
                      <HeroCard icon={<FaFire size={11} color="#f97316" />} label="Most traded" coin={hero.mostTraded.coin} value={`${hero.mostTraded.totalTrades} trades`} valueColor="#f97316" />
                      <HeroCard icon={<FaTrophy size={11} color="#22c55e" />} label="Best" coin={hero.best.coin} value={fmtUsd(hero.best.totalPnL)} valueColor="#22c55e" />
                      <HeroCard icon={<FaTint size={11} color="#ef4444" />} label="Biggest bleeder" coin={hero.worst.coin} value={fmtUsd(hero.worst.totalPnL)} valueColor="#ef4444" />
                    </div>
                  )}

                  {/* ── MOBILE: card list ── */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[9px] uppercase tracking-wider text-slate-600 font-bold">Sort</span>
                      {([["pnl", "P&L"], ["trades", "Trades"], ["held", "Held"]] as [SortKey, string][]).map(([k, label]) => (
                        <button
                          key={k}
                          onClick={() => setSort(k)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all"
                          style={{
                            background: sortKey === k ? "rgba(20,184,166,0.2)" : "rgba(255,255,255,0.04)",
                            color: sortKey === k ? "#2dd4bf" : "#64748b",
                            border: `1px solid ${sortKey === k ? "rgba(20,184,166,0.4)" : "rgba(255,255,255,0.06)"}`,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      {rows.map((r) => {
                        const cfg = ASSET_CONFIG[r.coin] || { color: "#64748b" };
                        const isOpen2 = expanded === r.coin;
                        return (
                          <div key={r.coin} className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <button onClick={() => setExpanded(isOpen2 ? null : r.coin)} className="w-full flex items-center justify-between px-3 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                {isOpen2 ? <FaChevronDown size={9} className="text-slate-600" /> : <FaChevronRight size={9} className="text-slate-600" />}
                                <span className="text-[13px] font-bold" style={{ color: cfg.color }}>{r.coin}</span>
                                <span className="text-[9px] text-slate-500">{r.totalTrades} trades</span>
                                {r.costBasisPartial && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}>PARTIAL</span>}
                              </div>
                              <div className="text-right">
                                <div className="text-[12px] font-bold font-mono" style={{ color: pnlColor(r.totalPnL) }}>{fmtUsd(r.totalPnL)}</div>
                                <div className="text-[9px] font-mono text-slate-500">{fmtUsd(r.marketValue)} held</div>
                              </div>
                            </button>
                            {isOpen2 && (
                              <div className="px-3 pb-3 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                                <DetailGrid r={r} points={tradePoints[r.coin]} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── DESKTOP: sortable table ── */}
                  <div className="hidden md:block rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wider text-slate-500" style={{ background: "rgba(255,255,255,0.03)" }}>
                          <Th label="Coin" k="coin" align="left" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="coin" />} />
                          <Th label="Trades" k="trades" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="trades" />} />
                          <Th label="Avg Cost" k="avgCost" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="avgCost" />} />
                          <Th label="Current" k="current" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="current" />} />
                          <Th label="Realised" k="realized" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="realized" />} />
                          <Th label="Unrealised" k="unrealized" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="unrealized" />} />
                          <Th label="Total P&L" k="pnl" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="pnl" />} />
                          <Th label="Held" k="held" sortKey={sortKey} onSort={setSort} icon={<SortIcon k="held" />} />
                          <th className="w-6" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const cfg = ASSET_CONFIG[r.coin] || { color: "#64748b" };
                          const isOpen2 = expanded === r.coin;
                          return (
                            <Fragment key={r.coin}>
                              <tr
                                onClick={() => setExpanded(isOpen2 ? null : r.coin)}
                                className="cursor-pointer transition-colors hover:bg-white/[0.03]"
                                style={{ borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)" }}
                              >
                                <td className="px-3 py-2.5 text-left">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold" style={{ color: cfg.color }}>{r.coin}</span>
                                    {r.costBasisPartial && <span className="text-[8px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(234,179,8,0.15)", color: "#eab308" }}>PARTIAL</span>}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-400 text-xs">
                                  <span className="text-green-400">{r.buys}</span><span className="text-slate-600">/</span><span className="text-red-400">{r.sells}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-300 text-xs">{fmtPrice(r.avgCost)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-300 text-xs">{fmtPrice(r.currentPrice)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: pnlColor(r.realizedPnL) }}>{fmtUsd(r.realizedPnL)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: pnlColor(r.unrealizedPnL) }}>
                                  {fmtUsd(r.unrealizedPnL)}
                                  <span className="text-slate-600"> ({r.unrealizedPct > 0 ? "+" : ""}{r.unrealizedPct.toFixed(0)}%)</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: pnlColor(r.totalPnL) }}>{fmtUsd(r.totalPnL)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-slate-300 text-xs">{fmtUsd(r.marketValue)}</td>
                                <td className="px-2 text-slate-600">{isOpen2 ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}</td>
                              </tr>
                              {isOpen2 && (
                                <tr style={{ background: "rgba(255,255,255,0.015)" }}>
                                  <td colSpan={9} className="px-4 py-3">
                                    <DetailGrid r={r} wide points={tradePoints[r.coin]} />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="text-[9px] md:text-[10px] text-slate-600 text-center md:text-left mt-3">
                    Read-only · realised P&L from sells, unrealised from live prices · avg-cost method · click a {`row`} for detail
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

const Th = ({ label, k, sortKey, onSort, icon, align = "right" }: { label: string; k: SortKey; sortKey: SortKey; onSort: (k: SortKey) => void; icon: React.ReactNode; align?: "left" | "right" }) => (
  <th className={`px-3 py-2.5 font-bold ${align === "left" ? "text-left" : "text-right"}`}>
    <button onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-teal-400 transition-colors ${sortKey === k ? "text-teal-400" : ""}`}>
      {align === "left" && icon}
      {label}
      {align === "right" && icon}
    </button>
  </th>
);

const HeroCard = ({ icon, label, coin, value, valueColor }: { icon: React.ReactNode; label: string; coin: string; value: string; valueColor: string }) => (
  <div className="rounded-xl p-2.5 md:p-3.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-slate-500 font-bold truncate">{label}</span>
    </div>
    <div className="text-[14px] md:text-lg font-bold" style={{ color: ASSET_CONFIG[coin]?.color || "#e2e8f0" }}>{coin}</div>
    <div className="text-[10px] md:text-sm font-bold font-mono" style={{ color: valueColor }}>{value}</div>
  </div>
);

const DetailGrid = ({ r, wide, points }: { r: Row; wide?: boolean; points?: CoinTradePoint[] | null }) => (
  <div>
    {/* Buy/sell scatter chart */}
    <div className="mb-3">
      {points === undefined || points === null ? (
        <div className="flex justify-center py-8">
          <div className="w-5 h-5 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
        </div>
      ) : points.length === 0 ? (
        <div className="text-[10px] text-slate-600 text-center py-4">No trade points to chart.</div>
      ) : (
        <CoinTradeChart trades={points} avgCost={r.avgCost} currentPrice={r.currentPrice} />
      )}
    </div>
    <div className={`grid ${wide ? "grid-cols-3 lg:grid-cols-4" : "grid-cols-2"} gap-x-4 gap-y-1.5`}>
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
    <Stat label="Realised P&L" value={fmtUsd(r.realizedPnL)} color={pnlColor(r.realizedPnL)} />
    <Stat label="Unrealised P&L" value={`${fmtUsd(r.unrealizedPnL)} (${r.unrealizedPct > 0 ? "+" : ""}${r.unrealizedPct.toFixed(1)}%)`} color={pnlColor(r.unrealizedPnL)} />
    {r.costBasisPartial && (
      <div className="col-span-2 lg:col-span-4 text-[9px] text-amber-500/80 mt-1">
        ⚠ Some of this coin was transferred in from an outside wallet, so cost basis &amp; P&L are partial.
      </div>
    )}
    </div>
  </div>
);

const Stat = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] text-slate-500">{label}</span>
    <span className="text-[10px] font-bold font-mono" style={{ color: color || "#cbd5e1" }}>{value}</span>
  </div>
);

export default CoinStatsView;
