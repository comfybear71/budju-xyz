import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTimes,
  FaArrowDown,
  FaArrowUp,
  FaShoppingCart,
  FaExchangeAlt,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchTransactions,
  type TradeTransaction,
} from "../services/tradeApi";

type FilterType = "all" | "deposit" | "withdrawal" | "buy" | "sell" | "external";

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deposit", label: "Deposits" },
  { key: "withdrawal", label: "Withdrawals" },
  { key: "buy", label: "Buys" },
  { key: "sell", label: "Sells" },
];

const TYPE_ICONS: Record<string, { icon: typeof FaArrowDown; color: string }> =
  {
    deposit: { icon: FaArrowDown, color: "text-green-400" },
    withdrawal: { icon: FaArrowUp, color: "text-red-400" },
    buy: { icon: FaShoppingCart, color: "text-blue-400" },
    sell: { icon: FaExchangeAlt, color: "text-amber-400" },
    external: { icon: FaExternalLinkAlt, color: "text-purple-400" },
  };

interface Props {
  isOpen: boolean;
  onClose: () => void;
  walletAddress?: string;
}

const TransactionHistory = ({ isOpen, onClose, walletAddress }: Props) => {
  const { isDarkMode } = useTheme();
  const [transactions, setTransactions] = useState<TradeTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    if (!isOpen) return;
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

  const formatDate = (ts: string) => {
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
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          <motion.div
            initial={{ y: 30, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 30, scale: 0.95 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-2xl border ${
              isDarkMode
                ? "bg-[#0a0a1a] border-white/[0.08]"
                : "bg-white border-gray-200"
            }`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-white/[0.06]" : "border-gray-100"}`}
            >
              <h2
                className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                Transactions
              </h2>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-full ${isDarkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
              >
                <FaTimes size={14} />
              </button>
            </div>

            {/* Filter tabs */}
            <div
              className={`flex gap-1 p-3 border-b overflow-x-auto ${isDarkMode ? "border-white/[0.06]" : "border-gray-100"}`}
            >
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-bold transition-colors ${
                    filter === tab.key
                      ? "bg-budju-pink/20 text-budju-pink"
                      : isDarkMode
                        ? "text-gray-500 hover:text-gray-300"
                        : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Transaction list */}
            <div className="overflow-y-auto max-h-[60vh] p-3 space-y-1.5">
              {loading ? (
                <div
                  className={`text-center py-10 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  Loading transactions...
                </div>
              ) : filtered.length === 0 ? (
                <div
                  className={`text-center py-10 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  No transactions found
                </div>
              ) : (
                filtered.map((tx) => {
                  const cfg = TYPE_ICONS[tx.type] || TYPE_ICONS.external;

                  return (
                    <div
                      key={tx.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg ${isDarkMode ? "hover:bg-white/[0.03]" : "hover:bg-gray-50"} transition-colors`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center ${isDarkMode ? "bg-white/[0.06]" : "bg-gray-100"}`}
                      >
                        <cfg.icon className={cfg.color} size={12} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-xs font-bold capitalize ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            {tx.type}
                          </span>
                          {tx.asset && (
                            <span
                              className={`text-[10px] ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              {tx.asset}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                        >
                          {formatDate(tx.timestamp)}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <div
                          className={`text-xs font-bold font-mono ${
                            tx.type === "deposit" || tx.type === "sell"
                              ? "text-green-400"
                              : tx.type === "withdrawal" || tx.type === "buy"
                                ? "text-red-400"
                                : isDarkMode
                                  ? "text-white"
                                  : "text-gray-900"
                          }`}
                        >
                          {tx.type === "deposit" || tx.type === "sell"
                            ? "+"
                            : "-"}
                          $
                          {(tx.total || tx.amount).toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TransactionHistory;
