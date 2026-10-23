import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTrophy,
  FaTimes,
} from "react-icons/fa";
import { HiOutlineChevronDown } from "react-icons/hi2";
import { fetchLeaderboard, type LeaderboardEntry } from "../services/tradeApi";
import WalletDetailPanel from "./WalletDetailPanel";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  poolValue: number;
  /** Admins can tap any wallet to drill into their deposits, NAV, Net P&L,
   * a Solscan link, and value-over-time chart. Regular visitors just see
   * the public rankings. */
  isAdmin?: boolean;
}

const Leaderboard = ({ isOpen, onClose, poolValue, isAdmin }: Props) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setExpanded(null);
      return;
    }
    if (poolValue <= 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLeaderboard(poolValue)
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, poolValue]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    } catch {
      return "";
    }
  };

  // Top 3 for podium
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Podium order: [2nd, 1st, 3rd]
  const podiumOrder = podium.length >= 3
    ? [podium[1], podium[0], podium[2]]
    : podium.length === 2
      ? [podium[1], podium[0]]
      : podium;

  const medalEmojis = ["🥇", "🥈", "🥉"];
  const podiumHeights = ["h-24", "h-32", "h-20"];

  const toggle = (wallet: string) => {
    if (!isAdmin) return;
    setExpanded((prev) => (prev === wallet ? null : wallet));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "tween", duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-50 bg-[#0f172a] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#0f172a]/95 backdrop-blur-sm border-b border-white/[0.06]">
            <div className="flex items-center gap-2.5">
              <FaTrophy className="text-yellow-400" size={16} />
              <h2 className="text-base font-bold text-white">Leaderboard</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-slate-400 transition-colors"
            >
              <FaTimes size={16} />
            </button>
          </div>

          <div className="px-4 py-5 max-w-2xl mx-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mb-3" />
                <span className="text-sm text-slate-500">Loading rankings...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-20">
                <FaTrophy className="mx-auto mb-3 text-slate-700" size={32} />
                <p className="text-sm text-slate-500">No users yet</p>
              </div>
            ) : (
              <>
                {/* Podium */}
                <div className="flex items-end justify-center gap-3 mb-6 pt-4">
                  {podiumOrder.map((entry, i) => {
                    const realIndex = podium.length >= 3 ? [1, 0, 2][i] : i;
                    const isFirst = realIndex === 0;

                    return (
                      <motion.div
                        key={entry.walletAddress}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => toggle(entry.walletAddress)}
                        className={`flex-1 max-w-[140px] rounded-xl p-3 text-center border transition-all ${
                          isFirst
                            ? "bg-gradient-to-b from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]"
                            : "bg-slate-800/40 border-slate-700/30"
                        } ${isAdmin ? "cursor-pointer hover:border-blue-500/30 active:scale-95" : ""} ${
                          expanded === entry.walletAddress ? "ring-1 ring-blue-500/40" : ""
                        }`}
                      >
                        <div className="text-2xl mb-1">{medalEmojis[realIndex]}</div>
                        <div className="text-xs font-mono text-slate-400 mb-1">
                          {entry.walletShort}
                        </div>
                        <div className="text-base font-bold text-white font-mono">
                          ${entry.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          {entry.allocation.toFixed(1)}% of pool
                        </div>
                        {entry.joinedDate && (
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            Joined {formatDate(entry.joinedDate)}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Admin drill-down for a podium wallet */}
                <AnimatePresence>
                  {isAdmin && expanded && podium.some((e) => e.walletAddress === expanded) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mb-4"
                    >
                      <div className="rounded-xl border border-blue-500/20 bg-slate-900/60 p-3">
                        <WalletDetailPanel wallet={expanded} totalPoolValue={poolValue} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Summary */}
                <div className="flex justify-between items-center px-2 mb-3">
                  <span className="text-xs text-blue-400 font-semibold">
                    {entries.length} Holders
                  </span>
                  <span className="text-xs text-slate-400">
                    Combined: ${entries.reduce((s, e) => s + e.currentValue, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Rest of leaderboard */}
                <div className="space-y-1.5">
                  {rest.map((entry, i) => (
                    <div key={entry.walletAddress}>
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 + i * 0.05 }}
                        onClick={() => toggle(entry.walletAddress)}
                        className={`flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border transition-all ${
                          isAdmin ? "cursor-pointer hover:border-blue-500/30 active:scale-[0.99]" : ""
                        } ${expanded === entry.walletAddress ? "border-blue-500/30" : "border-slate-700/20"}`}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-400">{entry.rank}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-slate-400">{entry.walletShort}</div>
                          {entry.joinedDate && (
                            <div className="text-[10px] text-slate-600">
                              Joined {formatDate(entry.joinedDate)}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-bold text-white font-mono">
                            ${entry.currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {entry.allocation.toFixed(1)}%
                          </div>
                        </div>
                        {isAdmin && (
                          <HiOutlineChevronDown
                            className={`w-3 h-3 text-slate-500 flex-shrink-0 transition-transform ${
                              expanded === entry.walletAddress ? "rotate-180" : ""
                            }`}
                          />
                        )}
                      </motion.div>

                      <AnimatePresence>
                        {isAdmin && expanded === entry.walletAddress && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1.5 mb-1 ml-2 pl-2.5 border-l border-slate-700/40 py-2">
                              <WalletDetailPanel wallet={entry.walletAddress} totalPoolValue={poolValue} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Leaderboard;
