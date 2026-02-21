import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaTrophy,
  FaTimes,
  FaChevronUp,
  FaChevronDown,
} from "react-icons/fa";
import { fetchLeaderboard, type LeaderboardEntry } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PODIUM_STYLES = [
  {
    bg: "from-yellow-500/20 via-amber-500/10 to-yellow-500/5",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_20px_rgba(234,179,8,0.15)]",
    medal: "text-yellow-400",
  },
  {
    bg: "from-gray-300/15 via-gray-400/8 to-gray-300/3",
    border: "border-gray-400/25",
    glow: "",
    medal: "text-gray-300",
  },
  {
    bg: "from-orange-500/15 via-orange-400/8 to-orange-500/3",
    border: "border-orange-500/25",
    glow: "",
    medal: "text-orange-400",
  },
];

const Leaderboard = ({ isOpen, onClose }: Props) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchLeaderboard()
      .then(setEntries)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

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
                <span className="text-sm text-slate-500">
                  Loading rankings...
                </span>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-20">
                <FaTrophy className="mx-auto mb-3 text-slate-700" size={32} />
                <p className="text-sm text-slate-500">No users yet</p>
                <p className="text-xs text-slate-600 mt-1">
                  Be the first to join the trading pool
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, i) => {
                  const podium = i < 3 ? PODIUM_STYLES[i] : null;
                  const isUp = entry.pnlPercent >= 0;

                  return (
                    <motion.div
                      key={entry.wallet}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.05 }}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                        podium
                          ? `bg-gradient-to-r ${podium.bg} ${podium.border} ${podium.glow}`
                          : "bg-slate-800/30 border-slate-700/20"
                      }`}
                    >
                      {/* Rank */}
                      <div className="w-8 text-center flex-shrink-0">
                        {podium ? (
                          <FaTrophy
                            className={podium.medal}
                            size={i === 0 ? 20 : 16}
                          />
                        ) : (
                          <span className="text-sm font-bold text-slate-500">
                            #{entry.rank}
                          </span>
                        )}
                      </div>

                      {/* User */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {entry.displayName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-600">
                          {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                        </div>
                      </div>

                      {/* Value & P&L */}
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-bold text-white font-mono">
                          $
                          {entry.value.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </div>
                        <div
                          className={`flex items-center justify-end gap-0.5 text-[11px] font-mono font-bold ${
                            isUp ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {isUp ? (
                            <FaChevronUp size={7} />
                          ) : (
                            <FaChevronDown size={7} />
                          )}
                          {isUp ? "+" : ""}
                          {entry.pnlPercent.toFixed(1)}%
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

export default Leaderboard;
