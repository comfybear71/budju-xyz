import type { PerpAccount } from "../../types/perps";

interface Props {
  account: PerpAccount;
}

const PerpAccountSummary = ({ account }: Props) => {
  const pnlColor = account.realized_pnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlSign = account.realized_pnl >= 0 ? "+" : "";
  const equityChange = ((account.equity - 10000) / 10000) * 100;
  const equityColor = equityChange >= 0 ? "text-emerald-400" : "text-red-400";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { label: "Balance", value: `$${account.balance.toFixed(2)}`, color: "text-white" },
        { label: "Equity", value: `$${account.equity.toFixed(2)}`, sub: `${equityChange >= 0 ? "+" : ""}${equityChange.toFixed(2)}%`, color: equityColor },
        { label: "Realized P&L", value: `${pnlSign}$${account.realized_pnl.toFixed(2)}`, color: pnlColor },
        { label: "Unrealized P&L", value: `${account.unrealized_pnl >= 0 ? "+" : ""}$${account.unrealized_pnl.toFixed(2)}`, color: account.unrealized_pnl >= 0 ? "text-emerald-400" : "text-red-400" },
      ].map((stat) => (
        <div key={stat.label} className="bg-slate-800/50 rounded-xl p-3 border border-white/[0.04]">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</div>
          <div className={`text-sm font-bold mt-0.5 ${stat.color}`}>{stat.value}</div>
          {stat.sub && <div className={`text-[10px] ${stat.color}`}>{stat.sub}</div>}
        </div>
      ))}
    </div>
  );
};

export default PerpAccountSummary;
