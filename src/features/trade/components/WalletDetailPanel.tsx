import { useState, useEffect, useRef } from "react";
import { FaArrowUp, FaArrowDown, FaExternalLinkAlt } from "react-icons/fa";
import PositionHistoryChart from "./PositionHistoryChart";
import {
  fetchUserPosition,
  fetchDeposits,
  fetchTransactions,
  buildPositionHistory,
  type UserPosition,
  type DepositRecord,
  type PositionHistoryPoint,
} from "../services/tradeApi";

const formatUsd = (n: number) =>
  Math.abs(n) >= 1000
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${n.toFixed(2)}`;

const formatDate = (iso: string | null) => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const shortWallet = (w: string) => (w.length > 8 ? `${w.slice(0, 4)}...${w.slice(-4)}` : w);

/** Admin-recorded (Swyftx) deposits get a synthetic txHash like
 * "admin_deposit_<ts>_<rand>" — not a real Solana signature, so there's
 * nothing to verify on Solscan. Only self-service on-chain deposits get a
 * real ~88-char base58 signature here. */
const isRealOnchainSignature = (txHash: string) =>
  !!txHash && !txHash.startsWith("admin_deposit_") && txHash.length >= 64;

interface Props {
  wallet: string;
  totalPoolValue: number;
}

/** Admin drill-down for a single user: value, Net P&L, current NAV, their
 * deposit/value history chart, and a per-deposit ledger showing the NAV
 * each deposit was priced at plus a direct Solscan link — so an admin can
 * independently verify any on-chain deposit actually landed, not just trust
 * what's recorded in Mongo. Shared by the Leaderboard and the "DEPOSITED"
 * stat card's community breakdown so both surfaces show the same info. */
const WalletDetailPanel = ({ wallet, totalPoolValue }: Props) => {
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [deposits, setDeposits] = useState<DepositRecord[]>([]);
  const [history, setHistory] = useState<PositionHistoryPoint[]>([]);

  // totalPoolValue changes on every live price tick from the parent — read
  // it via a ref instead of a dependency, so a flood of price updates while
  // this panel is open can't keep restarting the fetch (previously caused an
  // endless loading flicker that never settled).
  const totalPoolValueRef = useRef(totalPoolValue);
  totalPoolValueRef.current = totalPoolValue;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [pos, deps, txns] = await Promise.all([
        fetchUserPosition(wallet, totalPoolValueRef.current),
        fetchDeposits(wallet),
        fetchTransactions(wallet).catch(() => []),
      ]);
      if (cancelled) return;
      const withdrawals = txns.filter((t) => t.type === "withdrawal");
      setPosition(pos);
      setDeposits(deps.filter((d) => d.status !== "voided"));
      setHistory(
        buildPositionHistory(deps, withdrawals, {
          shares: pos?.shares || 0,
          nav: pos?.nav || 0,
          value: pos?.currentValue || 0,
          totalDeposited: pos?.totalDeposited || 0,
        }),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  if (loading) {
    return <div className="py-4 text-center text-[10px] text-slate-500">Loading...</div>;
  }

  const totalWithdrawn = position?.totalWithdrawn || 0;
  const totalDeposited = position?.totalDeposited || 0;
  const currentValue = position?.currentValue || 0;
  const netPnl = currentValue + totalWithdrawn - totalDeposited;
  const pnlPct = totalDeposited > 0 ? (netPnl / totalDeposited) * 100 : 0;

  return (
    <div>
      <a
        href={`https://solscan.io/account/${wallet}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-400 font-mono mb-2.5 transition-colors"
        title="View wallet on Solscan"
      >
        {shortWallet(wallet)} <FaExternalLinkAlt size={8} />
      </a>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Value</div>
          <div className="text-base font-bold text-white font-mono">{formatUsd(currentValue)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Net P&L</div>
          <div
            className={`text-base font-bold font-mono flex items-center gap-1 ${
              netPnl >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {netPnl >= 0 ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
            {formatUsd(Math.abs(netPnl))}
            <span className="text-[10px] font-normal opacity-70">
              ({pnlPct >= 0 ? "+" : ""}
              {pnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">Deposited</div>
          <div className="text-sm font-bold text-slate-300 font-mono">{formatUsd(totalDeposited)}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">NAV</div>
          <div className="text-sm font-bold text-slate-300 font-mono">${(position?.nav || 0).toFixed(4)}</div>
        </div>
        {totalWithdrawn > 0 && (
          <div className="col-span-2">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Withdrawn</div>
            <div className="text-sm font-bold text-amber-400/80 font-mono">{formatUsd(totalWithdrawn)}</div>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-slate-800/40 p-2.5 mb-2">
        <PositionHistoryChart points={history} />
      </div>

      <div className="space-y-1">
        {deposits.map((d, i) => (
          <div
            key={d.txHash || i}
            className="flex items-center justify-between gap-2 text-[10px] px-1 py-1 rounded hover:bg-slate-800/30"
          >
            <span className="text-slate-500 flex-shrink-0">{formatDate(d.timestamp)}</span>
            <span className="text-slate-400 font-mono text-right">
              {formatUsd(d.amount)} {d.currency}
              <span className="text-slate-600 ml-1">@ ${(d.nav || 0).toFixed(4)}</span>
              {d.navSource === "repriced" && <span className="text-amber-500/70 ml-1">(repriced)</span>}
            </span>
            {isRealOnchainSignature(d.txHash) && (
              <a
                href={`https://solscan.io/tx/${d.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-blue-400 transition-colors flex-shrink-0"
                title="Verify this deposit on Solscan"
              >
                <FaExternalLinkAlt size={8} />
              </a>
            )}
          </div>
        ))}
        {deposits.length === 0 && (
          <div className="text-[10px] text-slate-600 text-center py-1">No deposits on record</div>
        )}
      </div>
    </div>
  );
};

export default WalletDetailPanel;
