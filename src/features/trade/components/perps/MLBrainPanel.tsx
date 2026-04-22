import { useEffect, useState } from "react";

interface MLDecision {
  type: "allowed" | "blocked";
  strategy: string;
  symbol: string;
  direction: string;
  score: number | null;
  shap_summary: string;
  top_factors: { label: string; impact: number }[];
  time_ago: string;
}

interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

interface Rejection {
  rejected_by: string;
  label: string;
  strategy: string;
  symbol: string;
  direction: string;
  reason: string;
  time_ago: string;
}

interface MLStats {
  total: number;
  allowed: number;
  blocked: number;
  block_rate_pct: number;
  avg_allowed_score: number | null;
  avg_blocked_score: number | null;
}

interface SignalFunnelData {
  funnel: FunnelStage[];
  total_signals: number;
  ml_decisions: MLDecision[];
  recent_rejections: Rejection[];
  stats: MLStats;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  cooldown: { bg: "bg-blue-500/10", text: "text-blue-400", icon: "⏳" },
  already_open: { bg: "bg-slate-500/10", text: "text-slate-400", icon: "📌" },
  correlation: { bg: "bg-purple-500/10", text: "text-purple-400", icon: "🔗" },
  performance: { bg: "bg-orange-500/10", text: "text-orange-400", icon: "📉" },
  low_volatility: { bg: "bg-cyan-500/10", text: "text-cyan-400", icon: "💤" },
  overextended: { bg: "bg-amber-500/10", text: "text-amber-400", icon: "🚀" },
  regime: { bg: "bg-yellow-500/10", text: "text-yellow-400", icon: "🌊" },
  size: { bg: "bg-slate-500/10", text: "text-slate-400", icon: "📏" },
  balance: { bg: "bg-red-500/10", text: "text-red-400", icon: "💰" },
  ml: { bg: "bg-red-500/10", text: "text-red-400", icon: "🧠" },
  traded: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: "✅" },
};

export default function MLBrainPanel() {
  const [data, setData] = useState<SignalFunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"funnel" | "ml" | "rejections">("funnel");

  const load = () => {
    fetch("/api/ml-status")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-slate-500";
    if (score >= 0.6) return "text-emerald-400";
    if (score >= 0.45) return "text-yellow-400";
    return "text-red-400";
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Signal Funnel
        </div>
        <div className="text-[10px] text-slate-500 text-center py-3">Loading...</div>
      </div>
    );
  }

  if (!data || data.total_signals === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          Signal Funnel
        </div>
        <div className="text-[10px] text-slate-500 text-center py-3">
          No signals in the last 24h
          <br />
          <span className="text-slate-600">data appears after next auto-trade cycle</span>
        </div>
      </div>
    );
  }

  const { funnel, total_signals, ml_decisions, recent_rejections, stats } = data;
  const traded = funnel.find((s) => s.key === "traded")?.count ?? 0;
  const blocked = total_signals - traded;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Signal Funnel
        </div>
        <div className="text-[9px] text-slate-600">24h</div>
      </div>

      {/* Top summary */}
      <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-slate-900/40">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-slate-200">{total_signals}</span>
          <span className="text-[9px] text-slate-500">signals</span>
        </div>
        <div className="text-[9px] text-slate-600">→</div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-red-400">{blocked}</span>
          <span className="text-[9px] text-slate-500">filtered</span>
        </div>
        <div className="text-[9px] text-slate-600">→</div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-emerald-400">{traded}</span>
          <span className="text-[9px] text-slate-500">traded</span>
        </div>
        {total_signals > 0 && (
          <div className="ml-auto text-[9px] font-bold text-slate-400">
            {Math.round((traded / total_signals) * 100)}% pass
          </div>
        )}
      </div>

      {/* Funnel stages */}
      <div className="space-y-1 mb-3">
        {funnel.map((stage) => {
          const colors = STAGE_COLORS[stage.key] ?? STAGE_COLORS.cooldown;
          const pct = total_signals > 0 ? (stage.count / total_signals) * 100 : 0;
          return (
            <div key={stage.key} className="flex items-center gap-2 text-[9px]">
              <span className="w-3 text-center">{colors.icon}</span>
              <span className="w-[90px] text-slate-400 truncate">{stage.label}</span>
              <div className="flex-1 h-2 bg-slate-900/60 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stage.key === "traded" ? "bg-emerald-500/60" : "bg-slate-500/40"}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className={`w-6 text-right font-bold ${colors.text}`}>{stage.count}</span>
            </div>
          );
        })}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-2">
        {(["funnel", "ml", "rejections"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[8px] uppercase font-bold py-1 rounded-md transition-colors ${
              tab === t
                ? "bg-slate-700/50 text-slate-200"
                : "text-slate-500 hover:text-slate-400"
            }`}
          >
            {t === "funnel" ? "Overview" : t === "ml" ? `ML (${ml_decisions.length})` : `Filters (${recent_rejections.length})`}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "funnel" && (
        <div className="space-y-2">
          {/* ML score bars */}
          {(stats.avg_allowed_score !== null || stats.avg_blocked_score !== null) && (
            <div className="flex gap-2">
              {stats.avg_allowed_score !== null && (
                <div className="flex-1 text-center p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[11px] font-bold text-emerald-400">{Math.round(stats.avg_allowed_score * 100)}%</div>
                  <div className="text-[8px] text-slate-500">avg ML allowed</div>
                </div>
              )}
              {stats.avg_blocked_score !== null && (
                <div className="flex-1 text-center p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="text-[11px] font-bold text-red-400">{Math.round(stats.avg_blocked_score * 100)}%</div>
                  <div className="text-[8px] text-slate-500">avg ML blocked</div>
                </div>
              )}
            </div>
          )}
          {total_signals > 0 && funnel.length > 1 && (
            <div className="text-[8px] text-slate-600 text-center">
              Biggest filter: {funnel.filter((s) => s.key !== "traded").sort((a, b) => b.count - a.count)[0]?.label ?? "none"}
            </div>
          )}
        </div>
      )}

      {/* ML decisions tab */}
      {tab === "ml" && (
        <div className="space-y-1.5">
          {ml_decisions.length === 0 ? (
            <div className="text-[9px] text-slate-500 text-center py-2">
              No ML-scored signals yet
            </div>
          ) : (
            ml_decisions.map((d, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-2 rounded-lg text-[9px] ${
                  d.type === "allowed"
                    ? "bg-emerald-500/5 border border-emerald-500/10"
                    : "bg-red-500/5 border border-red-500/10"
                }`}
              >
                <span className="mt-px">{d.type === "allowed" ? "✅" : "❌"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-slate-200">{d.symbol}</span>
                    <span className={`uppercase text-[8px] font-bold ${d.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                      {d.direction}
                    </span>
                    <span className="text-slate-500">{d.strategy}</span>
                    <span className="ml-auto text-slate-600 shrink-0">{d.time_ago}</span>
                  </div>
                  {d.score !== null && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-slate-500">ML:</span>
                      <span className={`font-bold font-mono ${scoreColor(d.score)}`}>
                        {Math.round(d.score * 100)}%
                      </span>
                      {d.type === "blocked" && d.top_factors.length > 0 && (
                        <span className="text-slate-500 truncate ml-1">
                          · {d.top_factors.map((f) => f.label).join(", ")}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Filter rejections tab */}
      {tab === "rejections" && (
        <div className="space-y-1.5">
          {recent_rejections.length === 0 ? (
            <div className="text-[9px] text-slate-500 text-center py-2">
              No filter rejections yet — data appears after deploy
            </div>
          ) : (
            recent_rejections.map((r, i) => {
              const colors = STAGE_COLORS[r.rejected_by] ?? STAGE_COLORS.cooldown;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-2 rounded-lg text-[9px] ${colors.bg} border border-white/[0.04]`}
                >
                  <span className="mt-px">{colors.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-200">{r.symbol}</span>
                      {r.direction && r.direction !== "none" && (
                        <span className={`uppercase text-[8px] font-bold ${r.direction === "long" ? "text-emerald-400" : "text-red-400"}`}>
                          {r.direction}
                        </span>
                      )}
                      <span className="text-slate-500">{r.strategy}</span>
                      <span className="ml-auto text-slate-600 shrink-0">{r.time_ago}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`font-bold ${colors.text}`}>{r.label}</span>
                      <span className="text-slate-500 truncate ml-1">· {r.reason}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
