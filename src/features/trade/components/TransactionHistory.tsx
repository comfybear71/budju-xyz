import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTimes,
  FaArrowDown,
  FaArrowUp,
  FaShoppingCart,
  FaExchangeAlt,
  FaHistory,
  FaSync,
  FaChevronDown,
} from "react-icons/fa";
import {
  fetchTransactions,
  type TradeTransaction,
} from "../services/tradeApi";

type FilterType = "all" | "deposit" | "withdrawal" | "buy" | "sell";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deposit", label: "Deposits" },
  { key: "withdrawal", label: "Withdrawals" },
  { key: "buy", label: "Buys" },
  { key: "sell", label: "Sells" },
];

const TYPE_ICONS: Record<
  string,
  { icon: typeof FaArrowDown; color: string; bg: string }
> = {
  deposit: { icon: FaArrowDown, color: "text-green-400", bg: "bg-green-500/10" },
  withdrawal: { icon: FaArrowUp, color: "text-red-400", bg: "bg-red-500/10" },
  buy: { icon: FaShoppingCart, color: "text-blue-400", bg: "bg-blue-500/10" },
  sell: { icon: FaExchangeAlt, color: "text-amber-400", bg: "bg-amber-500/10" },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  walletAddress?: string;
  /** Admin's own wallet is excluded from pool allocations, so a wallet-scoped
   *  buy/sell query is always empty for it — request the full pool feed instead. */
  isAdmin?: boolean;
}

const TransactionHistory = ({ isOpen, onClose, walletAddress, isAdmin }: Props) => {
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedCoin, setExpandedCoin] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      setTransactions([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const txns = await fetchTransactions(walletAddress, isAdmin);
      setTransactions(txns);
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
      setError(err?.message || "Failed to load transactions");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress, isAdmin]);

  useEffect(() => {
    if (!isOpen) return;
    loadTransactions();
  }, [isOpen, loadTransactions]);

  // Does this row belong to the wallet looking at it? (No wallet on the row =
  // it came from this wallet's own feed.)
  const isOwn = (t: TradeTransaction) => !t.wallet || !walletAddress || t.wallet === walletAddress;
  // A feed that mixes in other wallets' rows (the admin's pool view) gets a
  // "YOU" tag on its own rows so they stand out at a glance.
  const mixedFeed = useMemo(
    () => !!walletAddress && transactions.some((t) => t.wallet && t.wallet !== walletAddress),
    [transactions, walletAddress],
  );

  const filtered = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((t) => t.type === filter),
    [transactions, filter],
  );

  // Buys/Sells are per-user bot trades — as the wallet base grows, this
  // list grows one row per trade per wallet forever. Grouped by coin
  // instead: one row showing the accumulated quantity bought/sold and
  // accumulated USD, which stays a constant-size list no matter how many
  // wallets or trades contribute to it. Click a row to expand the
  // underlying per-wallet trades that make it up. Deposits/withdrawals
  // stay as individual rows above — each is already a single meaningful
  // event per user, not something that compounds the same way.
  const isGroupedView = filter === "buy" || filter === "sell";
  const groupedByCoin = useMemo(() => {
    if (!isGroupedView) return [];
    const groups = new Map<string, { coin: string; totalQty: number; totalUsd: number; lastTs: number; trades: TradeTransaction[] }>();
    for (const t of filtered) {
      const coin = t.coin || "?";
      const qty = t.amount || 0;
      const usd = qty * (t.price || 0);
      const ts = t.timestamp ? new Date(t.timestamp).getTime() : 0;
      const g = groups.get(coin) || { coin, totalQty: 0, totalUsd: 0, lastTs: 0, trades: [] };
      g.totalQty += qty;
      g.totalUsd += usd;
      g.lastTs = Math.max(g.lastTs, ts);
      g.trades.push(t);
      groups.set(coin, g);
    }
    for (const g of groups.values()) {
      g.trades.sort((a, b) => {
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        return tb - ta;
      });
    }
    return Array.from(groups.values()).sort((a, b) => b.lastTs - a.lastTs);
  }, [filtered, isGroupedView]);

  useEffect(() => {
    setExpandedCoin(null);
  }, [filter]);

  const formatDate = (ts: string | null) => {
    if (!ts) return "";
    try {
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "tween", duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-50 bg-[#0f172a] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <FaHistory className="text-blue-400" size={14} />
              <h2 className="text-base font-bold text-white">Activity</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadTransactions}
                disabled={loading}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors disabled:opacity-30"
              >
                <FaSync size={12} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"
              >
                <FaTimes size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 px-4 py-3 border-b border-white/[0.06] overflow-x-auto no-scrollbar">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  filter === tab.key
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    : "text-slate-500 hover:text-slate-300 border border-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 max-w-2xl mx-auto w-full">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mb-3" />
                <span className="text-sm text-slate-500">Loading transactions...</span>
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <FaHistory className="mx-auto mb-3 text-red-500/50" size={28} />
                <p className="text-sm text-red-400 mb-3">Failed to load transactions</p>
                <button
                  onClick={loadTransactions}
                  className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-bold hover:bg-blue-500/20 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <FaHistory className="mx-auto mb-3 text-slate-700" size={28} />
                <p className="text-sm text-slate-500">No transactions found</p>
              </div>
            ) : isGroupedView ? (
              <div className="space-y-1.5">
                {groupedByCoin.map((g) => {
                  const cfg = filter === "buy" ? TYPE_ICONS.buy : TYPE_ICONS.sell;
                  const isExpanded = expandedCoin === g.coin;
                  return (
                    <div key={g.coin}>
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedCoin(isExpanded ? null : g.coin)}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                          <cfg.icon className={cfg.color} size={12} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-bold capitalize ${cfg.color}`}>{filter}</span>
                            <span className="text-[10px] text-slate-500 font-mono">{g.coin}</span>
                            <FaChevronDown
                              size={8}
                              className={`text-slate-600 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </div>
                          <div className="text-[10px] text-slate-600">
                            {g.trades.length} trade{g.trades.length === 1 ? "" : "s"} · last {formatDate(g.trades[0]?.timestamp ?? null)}
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0">
                          <div className={`text-xs font-bold font-mono ${filter === "sell" ? "text-green-400" : "text-red-400"}`}>
                            {filter === "sell" ? "+" : "-"}$
                            {g.totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-[10px] text-slate-600 font-mono">
                            {g.totalQty.toLocaleString(undefined, { maximumFractionDigits: 6 })} {g.coin}
                          </div>
                        </div>
                      </motion.div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="ml-4 mr-1 mb-1.5 pl-3 border-l border-slate-700/40 space-y-1">
                              {g.trades.map((t, i) => (
                                <div
                                  key={`${t.timestamp}-${i}`}
                                  className="flex items-center justify-between gap-2 text-[11px] px-2 py-1.5 rounded hover:bg-slate-800/30"
                                >
                                  <div>
                                    <span className={`font-mono ${isOwn(t) && mixedFeed ? "text-white font-bold" : "text-slate-400"}`}>{t.walletShort || "—"}</span>
                                    {isOwn(t) && mixedFeed && (
                                      <span className="ml-1.5 text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 align-middle">YOU</span>
                                    )}
                                    <span className="text-slate-600 ml-2">{formatDate(t.timestamp)}</span>
                                  </div>
                                  <div className="text-right font-mono">
                                    <span className="text-slate-300">
                                      {(t.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {t.coin}
                                    </span>
                                    <span className="text-slate-600 ml-2">
                                      ${((t.amount || 0) * (t.price || 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((tx, i) => {
                  const cfg = TYPE_ICONS[tx.type] || TYPE_ICONS.buy;
                  // record_trade() always stores `amount` as the crypto
                  // quantity bought/sold (both the server cron and the
                  // browser auto-trader pass quantity, never a dollar
                  // figure) — so both buy and sell need amount × price to
                  // get the USD value. Deposits/withdrawals store amount as
                  // USD/AUD directly, so they're left as-is.
                  const isTrade = tx.type === "buy" || tx.type === "sell";
                  const displayAmount = isTrade
                    ? (tx.amount || 0) * (tx.price || 0)
                    : tx.amount || 0;
                  const quantity = tx.amount || 0;

                  return (
                    <motion.div
                      key={`${tx.type}-${tx.timestamp}-${i}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800/30 transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                        <cfg.icon className={cfg.color} size={12} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold capitalize ${isOwn(tx) ? cfg.color : "text-slate-300"}`}>{tx.type}</span>
                          {tx.coin && (
                            <span className="text-[10px] text-slate-500 font-mono">{tx.coin}</span>
                          )}
                          {mixedFeed && isOwn(tx) && (
                            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">YOU</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {formatDate(tx.timestamp)}
                          {tx.walletShort && tx.walletShort !== "Pool Trade" && (
                            <span className="ml-1 text-slate-700">{tx.walletShort}</span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div className={`text-xs font-bold font-mono ${
                          tx.type === "deposit" || tx.type === "sell" ? "text-green-400"
                            : tx.type === "withdrawal" || tx.type === "buy" ? "text-red-400"
                            : "text-white"
                        }`}>
                          {tx.type === "deposit" || tx.type === "sell" ? "+" : "-"}$
                          {displayAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        {isTrade && (
                          <div className="text-[10px] text-slate-600 font-mono">
                            {quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tx.coin}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TransactionHistory;
