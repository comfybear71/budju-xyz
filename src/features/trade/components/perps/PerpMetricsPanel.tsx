import type { PerpMetrics } from "../../types/perps";

interface Props {
  metrics: PerpMetrics;
}

const PerpMetricsPanel = ({ metrics }: Props) => {
  if (metrics.total_trades === 0) {
    return (
      <div className="text-center py-4 text-slate-500 text-xs">
        Complete trades to see performance metrics. Need 200+ for statistical significance.
      </div>
    );
  }

  const statGroups = [
    {
      title: "Performance",
      stats: [
        { label: "Total P&L", value: `$${metrics.total_pnl.toFixed(2)}`, color: metrics.total_pnl >= 0 ? "text-emerald-400" : "text-red-400" },
        { label: "Win Rate", value: `${metrics.win_rate}%`, color: metrics.win_rate >= 50 ? "text-emerald-400" : "text-amber-400" },
        { label: "Profit Factor", value: `${metrics.profit_factor}`, color: metrics.profit_factor >= 1.5 ? "text-emerald-400" : "text-amber-400" },
        { label: "Expectancy", value: `$${metrics.expectancy}/trade`, color: metrics.expectancy > 0 ? "text-emerald-400" : "text-red-400" },
      ],
    },
    {
      title: "Risk-Adjusted",
      stats: [
        { label: "Sharpe Ratio", value: `${metrics.sharpe_ratio}`, color: metrics.sharpe_ratio >= 1 ? "text-emerald-400" : "text-amber-400" },
        { label: "Sortino Ratio", value: `${metrics.sortino_ratio}`, color: metrics.sortino_ratio >= 1.5 ? "text-emerald-400" : "text-amber-400" },
        { label: "Max Drawdown", value: `${metrics.max_drawdown}%`, color: metrics.max_drawdown < 10 ? "text-emerald-400" : "text-red-400" },
        { label: "Kelly %", value: `${metrics.kelly_criterion}%`, color: "text-blue-400" },
      ],
    },
    {
      title: "Trade Stats",
      stats: [
        { label: "Total Trades", value: `${metrics.total_trades}`, color: "text-white" },
        { label: "Avg R:R", value: `${metrics.avg_rr_ratio}:1`, color: metrics.avg_rr_ratio >= 1.5 ? "text-emerald-400" : "text-amber-400" },
        { label: "Avg Hold", value: metrics.avg_holding_period, color: "text-slate-300" },
        { label: "Best / Worst", value: `$${metrics.best_trade} / $${metrics.worst_trade}`, color: "text-slate-300" },
      ],
    },
    {
      title: "Costs & Streaks",
      stats: [
        { label: "Total Fees", value: `$${metrics.total_fees}`, color: "text-amber-400" },
        { label: "Total Funding", value: `$${metrics.total_funding}`, color: "text-amber-400" },
        { label: "Win Streak", value: `${metrics.consecutive_wins}`, color: "text-emerald-400" },
        { label: "Loss Streak", value: `${metrics.consecutive_losses}`, color: "text-red-400" },
      ],
    },
  ];

  // Progress bar toward 200-trade statistical significance
  const progress = Math.min(metrics.total_trades / 200, 1);

  return (
    <div className="space-y-3">
      {/* Statistical significance progress */}
      <div className="bg-slate-800/40 rounded-lg p-2 border border-white/[0.04]">
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-slate-500">Statistical Significance</span>
          <span className={metrics.total_trades >= 200 ? "text-emerald-400" : "text-amber-400"}>
            {metrics.total_trades}/200 trades
          </span>
        </div>
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${metrics.total_trades >= 200 ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* Metric groups */}
      {statGroups.map((group) => (
        <div key={group.title}>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">{group.title}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {group.stats.map((stat) => (
              <div key={stat.label} className="bg-slate-800/30 rounded-lg px-2.5 py-1.5 border border-white/[0.02]">
                <div className="text-[10px] text-slate-500">{stat.label}</div>
                <div className={`text-xs font-bold ${stat.color}`}>{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PerpMetricsPanel;
