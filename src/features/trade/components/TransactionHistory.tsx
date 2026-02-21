import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTimes,
  FaArrowDown,
  FaArrowUp,
  FaShoppingCart,
  FaExchangeAlt,
  FaHistory,
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
}

const TransactionHistory = ({ isOpen, onClose, walletAddress }: Props) => {
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!isOpen || !walletAddress) return;
    setLoading(true);
    fetchTransactions(walletAddress)
      .then(setTransactions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, walletAddress]);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? transactions
        : transactions.filter((t) => t.type === filter),
    [transactions, filter],
  );

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
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"
            >
              <FaTimes size={16} />
            </button>
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
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <FaHistory className="mx-auto mb-3 text-slate-700" size={28} />
                <p className="text-sm text-slate-500">No transactions found</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((tx, i) => {
                  const cfg = TYPE_ICONS[tx.type] || TYPE_ICONS.buy;
                  const displayAmount = tx.type === "buy" || tx.type === "sell"
                    ? (tx.amount || 0) * (tx.price || 0)
                    : tx.amount || 0;

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
                          <span className="text-xs font-bold text-white capitalize">{tx.type}</span>
                          {tx.coin && (
                            <span className="text-[10px] text-slate-500 font-mono">{tx.coin}</span>
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
