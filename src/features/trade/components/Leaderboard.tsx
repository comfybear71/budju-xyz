import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTrophy, FaTimes, FaChevronUp, FaChevronDown } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { fetchLeaderboard, type LeaderboardEntry } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PODIUM_STYLES = [
  { emoji: "🥇", bg: "from-yellow-400/20 to-amber-500/20", border: "border-yellow-400/30" },
  { emoji: "🥈", bg: "from-gray-300/20 to-gray-400/20", border: "border-gray-400/30" },
  { emoji: "🥉", bg: "from-orange-400/20 to-orange-500/20", border: "border-orange-400/30" },
];

const Leaderboard = ({ isOpen, onClose }: Props) => {
  const { isDarkMode } = useTheme();
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
            className={`relative w-full max-w-md max-h-[80vh] overflow-y-auto rounded-2xl border ${
              isDarkMode ? "bg-[#0a0a1a] border-white/[0.08]" : "bg-white border-gray-200"
            }`}
          >
            {/* Header */}
            <div
              className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b backdrop-blur-sm ${isDarkMode ? "bg-[#0a0a1a]/90 border-white/[0.06]" : "bg-white/90 border-gray-100"}`}
            >
              <div className="flex items-center gap-2">
                <FaTrophy className="text-yellow-400" size={16} />
                <h2
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  Leaderboard
                </h2>
              </div>
              <button
                onClick={onClose}
                className={`p-1.5 rounded-full ${isDarkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <div
                  className={`text-center py-10 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  Loading rankings...
                </div>
              ) : entries.length === 0 ? (
                <div
                  className={`text-center py-10 text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  No users yet — be the first!
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map((entry, i) => {
                    const podium = i < 3 ? PODIUM_STYLES[i] : null;
                    const isUp = entry.pnlPercent >= 0;

                    return (
                      <div
                        key={entry.wallet}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                          podium
                            ? `bg-gradient-to-r ${podium.bg} ${podium.border}`
                            : isDarkMode
                              ? "bg-[#0c0c20]/40 border-white/[0.04]"
                              : "bg-white/40 border-gray-200/30"
                        }`}
                      >
                        {/* Rank */}
                        <div className="w-8 text-center flex-shrink-0">
                          {podium ? (
                            <span className="text-lg">{podium.emoji}</span>
                          ) : (
                            <span
                              className={`text-sm font-bold ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                            >
                              #{entry.rank}
                            </span>
                          )}
                        </div>

                        {/* User */}
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-xs font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            {entry.displayName}
                          </div>
                          <div
                            className={`text-[10px] font-mono ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                          >
                            {entry.wallet.slice(0, 4)}...{entry.wallet.slice(-4)}
                          </div>
                        </div>

                        {/* Value & P&L */}
                        <div className="text-right flex-shrink-0">
                          <div
                            className={`text-xs font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                          >
                            $
                            {entry.value.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </div>
                          <div
                            className={`flex items-center justify-end gap-0.5 text-[10px] font-mono ${isUp ? "text-green-400" : "text-red-400"}`}
                          >
                            {isUp ? (
                              <FaChevronUp size={7} />
                            ) : (
                              <FaChevronDown size={7} />
                            )}
                            {Math.abs(entry.pnlPercent).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Leaderboard;
