import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTrophy, FaTimes, FaCrown, FaChevronDown, FaArrowUp, FaArrowDown } from "react-icons/fa";
import { FaRobot, FaPowerOff } from "react-icons/fa";
import {
  fetchLiveLeaderboard,
  fetchWalletCashFlows,
  buildLiveCashFlowHistory,
  fetchAutoTradeStatus,
  setAutoTradeEnabled,
  placeTestBuyAllWallets,
  type LiveLeaderboardEntry,
  type WalletCashFlows,
  type AutoTradeStatus,
  type TestBuyAllResponse,
} from "../services/tradeApi";
import LeaderboardDoughnut from "./LeaderboardDoughnut";
import PositionHistoryChart from "./PositionHistoryChart";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  /** The admin's own connected wallet — sent as `requesterWallet` so the
   *  backend can authorize toggling ANOTHER wallet's bot on/off. */
  adminWallet?: string;
}

/**
 * Non-custodial leaderboard (Oct 2026 pivot) — BUDJU no longer pools money,
 * so there's no shared NAV or "% of pool" to rank by. Instead this ranks
 * every connected wallet by its own current Swyftx account value (read
 * live, directly from that wallet's own key), split into %cash vs %crypto.
 * Replaces the old share/NAV-based leaderboard entirely.
 */
const Leaderboard = ({ isOpen, onClose, isAdmin = false, adminWallet = "" }: Props) => {
  const [entries, setEntries] = useState<LiveLeaderboardEntry[]>([]);
  const [walletCount, setWalletCount] = useState(0);
  const [erroredWallets, setErroredWallets] = useState(0);
  const [combinedValue, setCombinedValue] = useState(0);
  const [loading, setLoading] = useState(true);

  // Admin-only: per-wallet Net P&L (deposited/withdrawn vs. live value),
  // fetched on demand when an entry is expanded — not everyone's raw coin
  // holdings, which isn't something we want to surface here (yet).
  const [cashFlowsByWallet, setCashFlowsByWallet] = useState<Record<string, WalletCashFlows | null>>({});
  const [expandedWallet, setExpandedWallet] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState<string | null>(null);

  // Admin-only: lets the admin flip any connected wallet's auto-trade bot
  // on/off from here, instead of relying on that wallet's own owner to
  // self-toggle it from their "My Exchange Key" panel.
  const [autoTradeByWallet, setAutoTradeByWallet] = useState<Record<string, AutoTradeStatus | null>>({});
  const [togglingWallet, setTogglingWallet] = useState<string | null>(null);

  // Admin-only: test a real BTC buy across EVERY connected wallet at once.
  const [showTestBuyAllConfirm, setShowTestBuyAllConfirm] = useState(false);
  const [testBuyingAll, setTestBuyingAll] = useState(false);
  const [testBuyAllResponse, setTestBuyAllResponse] = useState<TestBuyAllResponse | null>(null);
  const [testBuyAllError, setTestBuyAllError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setExpandedWallet(null);
    fetchLiveLeaderboard()
      .then((lb) => {
        if (!lb) {
          setEntries([]);
          return;
        }
        setEntries(lb.entries);
        setWalletCount(lb.walletCount);
        setErroredWallets(lb.erroredWallets);
        setCombinedValue(lb.combinedValue);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  const toggleExpanded = (wallet: string) => {
    if (!isAdmin) return;
    setExpandedWallet((cur) => (cur === wallet ? null : wallet));
    if (!cashFlowsByWallet[wallet]) {
      setLoadingWallet(wallet);
      fetchWalletCashFlows(wallet)
        .then((cf) => setCashFlowsByWallet((prev) => ({ ...prev, [wallet]: cf })))
        .finally(() => setLoadingWallet((cur) => (cur === wallet ? null : cur)));
    }
    if (!autoTradeByWallet[wallet]) {
      fetchAutoTradeStatus(wallet).then((status) =>
        setAutoTradeByWallet((prev) => ({ ...prev, [wallet]: status })),
      );
    }
  };

  /** Admin flips this wallet's bot on/off from here — the wallet owner
   *  never has to touch their own toggle for this to take effect. */
  const handleToggleWalletAutoTrade = async (wallet: string, nextEnabled: boolean) => {
    setTogglingWallet(wallet);
    const res = await setAutoTradeEnabled(wallet, nextEnabled, adminWallet);
    if (res.success) {
      setAutoTradeByWallet((prev) => ({
        ...prev,
        [wallet]: { ...(prev[wallet] as AutoTradeStatus), autoTradeEnabled: !!res.autoTradeEnabled },
      }));
    }
    setTogglingWallet(null);
    return res;
  };

  const formatUsdWhole = (n: number) => `$${Math.round(n).toLocaleString()}`;

  /** Admin-only: fires a real BTC test buy for every wallet with a Swyftx
   *  key on file, via the exact same per-user pipeline a real auto-trade
   *  buy uses — proves it works for the whole connected user base at
   *  once instead of testing one wallet at a time. */
  const handleTestBuyAllWallets = async () => {
    if (!adminWallet) return;
    setTestBuyingAll(true);
    setTestBuyAllError(null);
    setTestBuyAllResponse(null);
    const res = await placeTestBuyAllWallets(adminWallet, "BTC");
    if (res.success && res.data) {
      setTestBuyAllResponse(res.data);
    } else {
      setTestBuyAllError(res.error || "Test buy failed");
    }
    setTestBuyingAll(false);
    setShowTestBuyAllConfirm(false);
  };

  /** Admin-only drill-down: this wallet's Net P&L — deposited/withdrawn
   *  (live from their own Swyftx history, or a manual override) against
   *  their current live total value — charted the same way as "Your
   *  Position" on the main Trade page.
   *
   *  Deliberately NOT rendered inside a podium card's own narrow column
   *  (`max-w-[140px]`) — the chart's SVG is responsive to its container,
   *  so squeezing it into a 140px-wide card made it unreadably cramped.
   *  Callers render this once, full-width, below the whole podium row. */
  const renderWalletDetail = (entry: LiveLeaderboardEntry) => {
    if (expandedWallet !== entry.walletAddress) return null;
    const cashFlows = cashFlowsByWallet[entry.walletAddress];
    const isLoading = loadingWallet === entry.walletAddress && !cashFlows;

    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="mt-2 mb-6 rounded-lg bg-slate-900/50 border border-slate-700/30 p-3">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            </div>
          ) : !cashFlows || (cashFlows.totalDepositedUsd === 0 && cashFlows.totalWithdrawnUsd === 0) ? (
            <div className="text-[11px] text-slate-600 text-center py-2">
              {cashFlows?.error
                ? "No deposit/withdrawal history available for this wallet."
                : "No deposit/withdrawal history found on Swyftx for this wallet yet."}
            </div>
          ) : (
            (() => {
              const netPnl = entry.totalValue + cashFlows.totalWithdrawnUsd - cashFlows.totalDepositedUsd;
              const netPnlPct = cashFlows.totalDepositedUsd > 0 ? (netPnl / cashFlows.totalDepositedUsd) * 100 : 0;
              const history = buildLiveCashFlowHistory(cashFlows.flows, entry.totalValue);
              return (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-2">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Deposited</div>
                      <div className="text-sm font-bold text-slate-300 font-mono">{formatUsdWhole(cashFlows.totalDepositedUsd)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Withdrawn</div>
                      <div className="text-sm font-bold text-amber-400/80 font-mono">{formatUsdWhole(cashFlows.totalWithdrawnUsd)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider">Net P&L</div>
                      <div className={`text-sm font-bold font-mono flex items-center gap-1 ${netPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {netPnl >= 0 ? <FaArrowUp size={9} /> : <FaArrowDown size={9} />}
                        {formatUsdWhole(Math.abs(netPnl))}
                        <span className="text-slate-500 font-normal">({netPnlPct >= 0 ? "+" : ""}{netPnlPct.toFixed(1)}%)</span>
                      </div>
                    </div>
                  </div>
                  <PositionHistoryChart points={history} />
                </>
              );
            })()
          )}

          {/* Admin control: flip THIS wallet's bot on/off ourselves —
              the wallet owner never has to touch their own toggle. */}
          {(() => {
            const autoTrade = autoTradeByWallet[entry.walletAddress];
            if (!autoTrade) return null;
            if (!autoTrade.configured) {
              return (
                <div className="mt-3 pt-3 border-t border-slate-700/30 text-[11px] text-slate-600">
                  No Swyftx key connected for this wallet yet — bot can't be enabled.
                </div>
              );
            }
            const enabled = !!autoTrade.autoTradeEnabled;
            const toggling = togglingWallet === entry.walletAddress;
            return (
              <div className="mt-3 pt-3 border-t border-slate-700/30 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <FaRobot className={enabled ? "text-emerald-400" : "text-slate-600"} size={12} />
                  <span className={`text-[11px] font-semibold ${enabled ? "text-emerald-300" : "text-slate-500"}`}>
                    Bot is {enabled ? "ON" : "OFF"} for this wallet
                  </span>
                </div>
                <button
                  onClick={() => handleToggleWalletAutoTrade(entry.walletAddress, !enabled)}
                  disabled={toggling || autoTrade.status !== "active"}
                  className={`text-[11px] font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                    enabled
                      ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  }`}
                >
                  <FaPowerOff size={10} />
                  {toggling ? "Working..." : enabled ? "Turn off" : "Turn on"}
                </button>
              </div>
            );
          })()}
        </div>
      </motion.div>
    );
  };

  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  const podiumOrder = podium.length >= 3
    ? [podium[1], podium[0], podium[2]]
    : podium.length === 2
      ? [podium[1], podium[0]]
      : podium;

  const medalEmojis = ["🥇", "🥈", "🥉"];

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
            <div className="text-[11px] text-slate-500 text-center mb-4 leading-relaxed">
              Every connected wallet's own live Swyftx balance, non-custodially — ranked by current value. BUDJU
              never holds or pools these funds.
            </div>

            {/* Admin-only: real-money BTC test buy across EVERY connected
                wallet at once, through the exact same per-user pipeline
                a real auto-trade buy uses. */}
            {isAdmin && (
              <div className="mb-5 rounded-lg bg-slate-900/50 border border-slate-700/30 p-3">
                {!showTestBuyAllConfirm && !testBuyingAll ? (
                  <button
                    onClick={() => setShowTestBuyAllConfirm(true)}
                    className="w-full text-[11px] font-semibold px-3 py-2 rounded-lg bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 transition-colors"
                  >
                    Test BTC buy — ALL connected wallets
                  </button>
                ) : testBuyingAll ? (
                  <div className="flex items-center justify-center gap-2 py-1 text-[11px] text-slate-400">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                    Running test buys across every connected wallet...
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-amber-300 mb-2">
                      This places a REAL BTC buy (max($10, 4% of balance)) on EVERY wallet with a Swyftx key on
                      file, through their own account. Wallets below the $30 reserve floor are skipped with an
                      error, not charged.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowTestBuyAllConfirm(false)}
                        className="flex-1 text-[11px] font-medium px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleTestBuyAllWallets}
                        className="flex-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-colors"
                      >
                        Confirm — place real orders
                      </button>
                    </div>
                  </div>
                )}

                {testBuyAllError && (
                  <div className="mt-2 text-[11px] text-red-400">{testBuyAllError}</div>
                )}

                {testBuyAllResponse && (
                  <div className="mt-3 pt-3 border-t border-slate-700/30">
                    <div className="text-[11px] text-slate-400 mb-1.5">
                      {testBuyAllResponse.succeeded} of {testBuyAllResponse.walletCount} wallet
                      {testBuyAllResponse.walletCount === 1 ? "" : "s"} bought BTC successfully
                      {testBuyAllResponse.failed > 0 ? `, ${testBuyAllResponse.failed} failed` : ""}.
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {testBuyAllResponse.results.map((r) => (
                        <div key={r.walletAddress} className="flex items-center justify-between text-[10px] font-mono">
                          <span className="text-slate-500">
                            {r.walletAddress.slice(0, 4)}...{r.walletAddress.slice(-4)}
                          </span>
                          <span className={r.success ? "text-emerald-400" : "text-red-400"}>
                            {r.success
                              ? `+${r.quantity} BTC ($${r.usdcSpent})`
                              : r.error}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-yellow-400 border-t-transparent animate-spin mb-3" />
                <span className="text-sm text-slate-500">Loading rankings...</span>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-20">
                <FaTrophy className="mx-auto mb-3 text-slate-700" size={32} />
                <p className="text-sm text-slate-500">No connected wallets yet</p>
              </div>
            ) : (
              <>
                {/* Cumulative total across every connected wallet */}
                <div className="mb-6">
                  <LeaderboardDoughnut entries={entries} combinedValue={combinedValue} />
                </div>

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
                        className="flex-1 max-w-[140px]"
                      >
                        <div
                          onClick={() => toggleExpanded(entry.walletAddress)}
                          className={`rounded-xl p-3 text-center border transition-all ${
                            isFirst
                              ? "bg-gradient-to-b from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-[0_0_15px_rgba(234,179,8,0.1)]"
                              : "bg-slate-800/40 border-slate-700/30"
                          } ${isAdmin ? "cursor-pointer hover:border-slate-500/50 active:scale-95" : ""}`}
                        >
                          <div className="text-2xl mb-1">{medalEmojis[realIndex]}</div>
                          <div className="flex items-center justify-center gap-1 text-xs font-mono text-slate-400 mb-1">
                            {entry.walletShort}
                            {entry.isAdmin && <FaCrown className="text-amber-400" size={9} />}
                            {isAdmin && (
                              <FaChevronDown
                                size={8}
                                className={`text-slate-600 transition-transform ${expandedWallet === entry.walletAddress ? "rotate-180" : ""}`}
                              />
                            )}
                          </div>
                          <div className="text-base font-bold text-white font-mono">
                            ${entry.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          <div className="flex justify-center gap-2 text-[10px] text-slate-500 mt-1">
                            <span className="text-emerald-400/80">{entry.pctCash.toFixed(0)}% cash</span>
                            <span className="text-blue-400/80">{entry.pctCrypto.toFixed(0)}% crypto</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Expanded detail for a podium selection renders here, full-width —
                    not inside that entry's own 140px-wide podium card above. */}
                <AnimatePresence>
                  {podium.find((e) => e.walletAddress === expandedWallet) &&
                    renderWalletDetail(podium.find((e) => e.walletAddress === expandedWallet)!)}
                </AnimatePresence>

                {/* Summary */}
                <div className="flex justify-between items-center px-2 mb-3">
                  <span className="text-xs text-blue-400 font-semibold">
                    {walletCount} Wallet{walletCount === 1 ? "" : "s"}
                    {erroredWallets > 0 && (
                      <span className="text-amber-500/70"> · {erroredWallets} unreachable</span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">
                    Combined: ${combinedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>

                {/* Rest of leaderboard */}
                <div className="space-y-1.5">
                  {rest.map((entry, i) => (
                    <motion.div
                      key={entry.walletAddress}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                    >
                      <div
                        onClick={() => toggleExpanded(entry.walletAddress)}
                        className={`flex items-center gap-3 p-3 rounded-xl bg-slate-800/30 border border-slate-700/20 ${
                          isAdmin ? "cursor-pointer hover:border-slate-600/40 active:scale-[0.99] transition-all" : ""
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-slate-400">{i + 4}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
                            {entry.walletShort}
                            {entry.isAdmin && <FaCrown className="text-amber-400" size={10} />}
                          </div>
                          <div className="flex gap-2 text-[10px] text-slate-600">
                            <span className="text-emerald-400/70">{entry.pctCash.toFixed(0)}% cash</span>
                            <span className="text-blue-400/70">{entry.pctCrypto.toFixed(0)}% crypto</span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          <div className="text-sm font-bold text-white font-mono">
                            ${entry.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </div>
                          {isAdmin && (
                            <FaChevronDown
                              size={9}
                              className={`text-slate-600 transition-transform ${expandedWallet === entry.walletAddress ? "rotate-180" : ""}`}
                            />
                          )}
                        </div>
                      </div>
                      <AnimatePresence>{renderWalletDetail(entry)}</AnimatePresence>
                    </motion.div>
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
