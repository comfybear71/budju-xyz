import { useState, useEffect } from "react";
import { FaUsers, FaSync } from "react-icons/fa";
import { fetchCommunityAggregateHoldings, type CommunityAggregateHoldings } from "../services/tradeApi";

interface Props {
  adminWallet: string;
}

/**
 * Admin-only "cumulative total" view for the non-custodial model — since
 * BUDJU no longer pools anyone's money, there's no shared NAV/leaderboard
 * to show. Instead, this does a live read across every connected wallet's
 * OWN Swyftx account (using each wallet's own key) and sums per-coin, so
 * the community's combined holdings are still visible without BUDJU ever
 * controlling a shared balance.
 */
const CommunityHoldingsSummary = ({ adminWallet }: Props) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommunityAggregateHoldings | null>(null);

  const load = () => {
    setLoading(true);
    fetchCommunityAggregateHoldings(adminWallet).then((d) => {
      setData(d);
      setLoading(false);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminWallet]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <FaUsers size={12} className="text-slate-500" />
          <span className="text-xs font-bold text-slate-300">Community Holdings</span>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <FaSync size={10} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading ? (
        <div className="text-[11px] text-slate-600 text-center py-3">Fetching from each connected account...</div>
      ) : !data ? (
        <div className="text-[11px] text-slate-600 text-center py-3">Could not load community holdings</div>
      ) : (
        <>
          <div className="text-[10px] text-slate-500 mb-2">
            {data.activeWallets} of {data.walletCount} connected wallets responding
            {data.erroredWallets > 0 && <span className="text-amber-500/80"> · {data.erroredWallets} unreachable</span>}
          </div>
          {Object.keys(data.totals).length === 0 ? (
            <div className="text-[11px] text-slate-600 text-center py-2">No holdings reported yet</div>
          ) : (
            <div className="rounded-lg bg-slate-800/40 p-2.5 grid grid-cols-2 gap-1.5">
              {Object.entries(data.totals)
                .sort((a, b) => b[1] - a[1])
                .map(([coin, amount]) => (
                  <div key={coin} className="flex justify-between text-[11px] font-mono">
                    <span className="text-slate-400">{coin}</span>
                    <span className="text-slate-200">{amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>
                  </div>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CommunityHoldingsSummary;
