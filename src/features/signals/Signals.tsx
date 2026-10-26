import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { FaSync, FaArrowLeft, FaExternalLinkAlt } from "react-icons/fa";
import { useNavigate } from "react-router";
import {
  fetchSignalsLeaderboard,
  fetchSignalsFeed,
  fetchSignalsOverview,
  fetchSignalsProgress,
  type SignalsLeaderboard,
  type SignalPosition,
  type SignalsOverview,
  type SignalsProgress,
} from "@features/signals/services/signalsApi";

const REFRESH_MS = 60_000;

const fmtUsd = (n: number | null | undefined) =>
  `${(n ?? 0) < 0 ? "-" : ""}$${Math.abs(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const shortAddr = (a: string) => (a && a.length > 8 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a);

const exitReasonLabel: Record<string, string> = {
  signal_sell: "Followed exit",
  stop_loss: "Stop-loss",
  max_hold_timeout: "Max hold reached",
};

const Signals = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<SignalsLeaderboard | null>(null);
  const [feed, setFeed] = useState<SignalPosition[]>([]);
  const [overview, setOverview] = useState<SignalsOverview | null>(null);
  const [progress, setProgress] = useState<SignalsProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [lb, sig, ov, prog] = await Promise.all([
      fetchSignalsLeaderboard(),
      fetchSignalsFeed(),
      fetchSignalsOverview(),
      fetchSignalsProgress(),
    ]);
    setLeaderboard(lb);
    setFeed(sig);
    setOverview(ov);
    setProgress(prog);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const entries = leaderboard?.entries ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 pt-20 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/trade")}
            aria-label="Back to Trade"
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:brightness-125"
            style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.25)" }}
          >
            <FaArrowLeft size={14} className="text-purple-400" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-slate-100 truncate">🎯 Signals</h1>
            <p className="text-[11px] md:text-xs text-slate-500">
              Paper trading sandbox — auto-sourced wallets, no real funds
            </p>
          </div>
        </div>
        <button
          onClick={load}
          aria-label="Refresh"
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <FaSync size={13} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Overview strip */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          <StatCard
            label="Wallets Watched"
            value={String(overview.trackedWallets)}
            color="#a855f7"
            sub={`${overview.activeWallets} proven`}
          />
          <StatCard label="Open Paper Trades" value={String(overview.openPositions)} color="#3b82f6" />
          <StatCard
            label="Total Paper P&L"
            value={fmtUsd(overview.totalPaperPnlUsd)}
            color={overview.totalPaperPnlUsd >= 0 ? "#22c55e" : "#ef4444"}
          />
          <StatCard label="Win Rate" value={`${overview.overallWinRate}%`} color="#2dd4bf" />
        </div>
      )}

      {loading && !leaderboard ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
        </div>
      ) : (
        <>
          {/* Leaderboard */}
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
            🏆 Wallet Leaderboard
          </div>
          {entries.length === 0 ? (
            <div className="rounded-2xl p-6 mb-5 text-center text-sm text-slate-500" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              No ranked wallets yet — tracked wallets need a handful of closed paper trades
              before they're scored and shown here. Check back soon.
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden mb-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {entries.map((e, i) => (
                <motion.div
                  key={e.address}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-bold text-slate-500 w-5 text-center flex-shrink-0">#{i + 1}</span>
                    <div className="min-w-0">
                      <a
                        href={`https://solscan.io/account/${e.address}`}
                        target="_blank" rel="noreferrer"
                        className="text-sm font-bold text-slate-200 hover:text-purple-300 flex items-center gap-1 truncate"
                      >
                        {e.label || shortAddr(e.address)} <FaExternalLinkAlt size={9} className="opacity-50 flex-shrink-0" />
                      </a>
                      <div className="text-[10px] text-slate-500">{e.trades} paper trades · {e.winRate}% win rate</div>
                    </div>
                  </div>
                  <span className="text-sm font-bold font-mono flex-shrink-0" style={{ color: e.totalPnlUsd >= 0 ? "#22c55e" : "#ef4444" }}>
                    {fmtUsd(e.totalPnlUsd)}
                  </span>
                </motion.div>
              ))}
            </div>
          )}

          {/* Wallets in Training — "pending" wallets with at least one paper
              trade logged, below the 10-trade minimum to appear on the real
              leaderboard above. Only rendered once something's actually
              happened — if nothing has traded yet there's nothing to show
              that the "No ranked wallets yet" message above doesn't already
              cover. */}
          {progress && progress.entries.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
                🏗️ Wallets in Training
                <span className="text-slate-600 font-normal ml-1.5 normal-case tracking-normal">
                  ({progress.inProgressCount} logging trades toward the {progress.minTradesToScore}-trade minimum)
                </span>
              </div>
              <div className="rounded-2xl overflow-hidden mb-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                {progress.entries.map((e, i) => {
                  const pct = Math.min(100, (e.trades / progress.minTradesToScore) * 100);
                  return (
                    <motion.div
                      key={e.address}
                      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                      className="px-4 py-3"
                      style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <a
                          href={`https://solscan.io/account/${e.address}`}
                          target="_blank" rel="noreferrer"
                          className="text-sm font-bold text-slate-200 hover:text-purple-300 flex items-center gap-1 truncate min-w-0"
                        >
                          {e.label || shortAddr(e.address)} <FaExternalLinkAlt size={9} className="opacity-50 flex-shrink-0" />
                        </a>
                        <span className="text-sm font-bold font-mono flex-shrink-0 ml-2" style={{ color: e.totalPnlUsd >= 0 ? "#22c55e" : "#ef4444" }}>
                          {fmtUsd(e.totalPnlUsd)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800/60 overflow-hidden mb-1.5">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }}
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #a855f7, #ec4899)" }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500">
                        <span>{e.trades}/{progress.minTradesToScore} paper trades · {e.wins}W-{e.losses}L</span>
                        <span className="text-purple-400/80">{e.tradesNeeded} more to graduate</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* Recent signals feed */}
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">
            📡 Recent Signals
          </div>
          {feed.length === 0 ? (
            <div className="rounded-2xl p-6 text-center text-sm text-slate-500" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              No signals yet. Once tracked wallets start trading, their buys/sells will
              appear here as simulated paper trades.
            </div>
          ) : (
            <div className="space-y-2">
              {feed.map((p) => {
                const isOpen = p.status === "open";
                const pnlColor = isOpen ? "#94a3b8" : p.pnlUsd >= 0 ? "#22c55e" : "#ef4444";
                return (
                  <div
                    key={p.id}
                    className="rounded-xl px-3 py-2.5 flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${isOpen ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.06)"}` }}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: isOpen ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.06)", color: isOpen ? "#60a5fa" : "#94a3b8" }}>
                          {isOpen ? "OPEN" : "CLOSED"}
                        </span>
                        <span className="text-sm font-bold text-slate-200">{p.tokenSymbol}</span>
                        <span className="text-[10px] text-slate-500 truncate">
                          {p.walletLabel || shortAddr(p.walletAddress)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {isOpen ? "Still following" : exitReasonLabel[p.exitReason || ""] || p.exitReason || "Closed"}
                        {p.entryAt ? ` · ${new Date(p.entryAt).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                    <span className="text-sm font-bold font-mono flex-shrink-0" style={{ color: pnlColor }}>
                      {isOpen ? "—" : `${p.pnlUsd >= 0 ? "+" : ""}${fmtUsd(p.pnlUsd)} (${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%)`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="text-[10px] text-slate-600 text-center leading-relaxed mt-6">
            100% paper trading — no real funds, no wallet connection required to view.
            Wallets are sourced automatically from public on-chain trading data and filtered
            for wash-trade/bot patterns; this is not financial advice and past paper performance
            is not a guarantee of anything. 🧪
          </div>
        </>
      )}
    </div>
  );
};

const StatCard = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
    <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold mb-0.5">{label}</div>
    <div className="text-base font-bold font-mono" style={{ color }}>{value}</div>
    {sub && <div className="text-[9px] text-slate-500 mt-0.5">{sub}</div>}
  </div>
);

export default Signals;
