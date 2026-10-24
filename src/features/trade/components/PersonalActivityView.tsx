import { useState, useEffect, useCallback } from "react";
import { FaHistory, FaSync, FaArrowUp, FaArrowDown, FaUserShield } from "react-icons/fa";
import { fetchUserActivity, fetchAllUsersActivity, type UserActivityEntry } from "../services/tradeApi";

interface Props {
  wallet: string;
  isAdmin?: boolean;
}

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

/**
 * Per-user bot trade activity for the non-custodial model (Phase 2). Each
 * wallet sees only its own bot trades; the admin can additionally switch to
 * a combined feed across every connected wallet. This is deliberately
 * separate from the legacy pool's deposit/withdrawal Activity tab — those
 * are real-money pool records and are untouched by this view.
 */
const PersonalActivityView = ({ wallet, isAdmin = false }: Props) => {
  const [entries, setEntries] = useState<UserActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewAll, setViewAll] = useState(false);

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    const data = viewAll && isAdmin ? await fetchAllUsersActivity(wallet) : await fetchUserActivity(wallet);
    setEntries(data);
    setLoading(false);
  }, [wallet, viewAll, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!wallet) {
    return (
      <div className="text-[11px] text-slate-600 text-center py-4">
        Connect your wallet to see your trade activity.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <FaHistory size={12} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-300">
            {viewAll && isAdmin ? "All Users' Activity" : "My Activity"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setViewAll((v) => !v)}
              className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${
                viewAll
                  ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                  : "bg-slate-800/50 text-slate-500 border border-slate-700/40 hover:text-slate-300"
              }`}
              title="Admin-only: view every connected wallet's activity"
            >
              <FaUserShield size={9} /> {viewAll ? "Viewing all" : "View all"}
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
            title="Refresh"
          >
            <FaSync size={10} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-[11px] text-slate-600 text-center py-4">Loading activity...</div>
      ) : entries.length === 0 ? (
        <div className="text-[11px] text-slate-600 text-center py-4">
          No bot trades yet. {!viewAll && "Trades your bot places will show up here."}
        </div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {entries.map((e, i) => (
            <div
              key={`${e.walletAddress || wallet}-${e.timestamp}-${i}`}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-800/30 transition-colors"
            >
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  e.side === "buy" ? "bg-blue-500/10" : "bg-amber-500/10"
                }`}
              >
                {e.side === "buy" ? (
                  <FaArrowDown className="text-blue-400" size={9} />
                ) : (
                  <FaArrowUp className="text-amber-400" size={9} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-white capitalize">{e.side}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{e.coin}</span>
                  {viewAll && e.walletAddress && (
                    <span className="text-[9px] text-slate-600 font-mono">
                      {e.walletAddress.slice(0, 4)}...{e.walletAddress.slice(-4)}
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-slate-600">{formatDate(e.timestamp)}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-bold font-mono text-slate-200">
                  {e.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
                <div className="text-[9px] text-slate-600 font-mono">@${e.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PersonalActivityView;
