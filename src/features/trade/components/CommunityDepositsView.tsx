import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HiOutlineChevronDown } from "react-icons/hi2";
import PositionHistoryChart from "./PositionHistoryChart";
import {
  fetchUserPosition,
  fetchDeposits,
  fetchTransactions,
  buildPositionHistory,
  type LeaderboardEntry,
  type PositionHistoryPoint,
  type DepositRecord,
} from "../services/tradeApi";

interface Props {
  entries: LeaderboardEntry[];
  totalPoolValue: number;
  onClose: () => void;
}

const formatUsd = (n: number) =>
  n >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
};

/** Admin-only: the whole community's deposits, click any wallet to drill
 * into exactly what they deposited/withdrew and when, plus their own
 * deposit/value chart — same chart a user sees on their own "Your
 * Position", reused here per-wallet. */
const CommunityDepositsView = ({ entries, totalPoolValue, onClose }: Props) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);
  const [historyCache, setHistoryCache] = useState<Record<string, PositionHistoryPoint[]>>({});
  const [depositsCache, setDepositsCache] = useState<Record<string, DepositRecord[]>>({});

  const toggle = async (wallet: string) => {
    if (expanded === wallet) {
      setExpanded(null);
      return;
    }
    setExpanded(wallet);
    if (historyCache[wallet]) return;

    setLoadingWallet(wallet);
    try {
      const [pos, deposits, txns] = await Promise.all([
        fetchUserPosition(wallet, totalPoolValue),
        fetchDeposits(wallet),
        fetchTransactions(wallet).catch(() => []),
      ]);
      const withdrawals = txns.filter((t) => t.type === "withdrawal");
      const points = buildPositionHistory(deposits, withdrawals, {
        shares: pos?.shares || 0,
        nav: pos?.nav || 0,
        value: pos?.currentValue || 0,
        totalDeposited: pos?.totalDeposited || 0,
      });
      setHistoryCache((prev) => ({ ...prev, [wallet]: points }));
      setDepositsCache((prev) => ({ ...prev, [wallet]: deposits.filter((d) => d.status !== "voided") }));
    } finally {
      setLoadingWallet(null);
    }
  };

  return (
    <div className="rounded-xl border border-green-500/20 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-green-400/70">
          Community Deposits ({entries.length})
        </span>
        <button onClick={onClose} className="text-[10px] text-slate-500 hover:text-white">
          Close
        </button>
      </div>

      <div className="space-y-1.5">
        {entries.map((user) => {
          const isOpen = expanded === user.walletAddress;
          return (
            <div key={user.walletAddress}>
              <button
                onClick={() => toggle(user.walletAddress)}
                className="w-full flex items-center justify-between py-1.5 px-1.5 rounded-lg hover:bg-slate-800/40 active:scale-[0.99] transition-all"
              >
                <div className="flex items-center gap-1.5">
                  <HiOutlineChevronDown
                    className={`w-3 h-3 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                  <span className="text-[11px] text-slate-400 font-mono">{user.walletShort}</span>
                  {user.joinedDate && (
                    <span className="text-[9px] text-slate-600">since {formatDate(user.joinedDate)}</span>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-bold text-green-400 font-mono">
                    {formatUsd(user.totalDeposited)}
                  </div>
                  <div className="text-[9px] text-slate-500">{user.allocation.toFixed(2)}% of pool</div>
                </div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1.5 mb-2 ml-4 pl-2.5 border-l border-slate-700/40">
                      {loadingWallet === user.walletAddress ? (
                        <div className="py-4 text-center text-[10px] text-slate-500">Loading...</div>
                      ) : (
                        <>
                          <div className="rounded-lg bg-slate-800/40 p-2.5 mb-2">
                            <PositionHistoryChart points={historyCache[user.walletAddress] || []} />
                          </div>
                          <div className="space-y-1">
                            {(depositsCache[user.walletAddress] || []).map((d, i) => (
                              <div
                                key={d.txHash || i}
                                className="flex items-center justify-between text-[10px] px-1 py-0.5"
                              >
                                <span className="text-slate-500">{formatDate(d.timestamp)}</span>
                                <span className="text-slate-400 font-mono">
                                  {formatUsd(d.amount)} {d.currency}
                                  {d.navSource === "repriced" && (
                                    <span className="text-amber-500/70 ml-1">(repriced)</span>
                                  )}
                                </span>
                              </div>
                            ))}
                            {(depositsCache[user.walletAddress] || []).length === 0 && (
                              <div className="text-[10px] text-slate-600 text-center py-1">No deposits on record</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CommunityDepositsView;
