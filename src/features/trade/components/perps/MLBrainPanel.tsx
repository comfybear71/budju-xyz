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

interface MLStats {
  total: number;
  allowed: number;
  blocked: number;
  block_rate_pct: number;
  avg_allowed_score: number | null;
  avg_blocked_score: number | null;
}

interface MLStatus {
  decisions: MLDecision[];
  stats: MLStats;
}

export default function MLBrainPanel() {
  const [data, setData] = useState<MLStatus | null>(null);
  const [loading, setLoading] = useState(true);

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
          🧠 ML Brain
        </div>
        <div className="text-[10px] text-slate-500 text-center py-3">Loading...</div>
      </div>
    );
  }

  if (!data || data.decisions.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          🧠 ML Brain
        </div>
        <div className="text-[10px] text-slate-500 text-center py-3">
          Waiting for first ML-scored trade…
          <br />
          <span className="text-slate-600">signals appear after next auto-trade</span>
        </div>
      </div>
    );
  }

  const { stats, decisions } = data;

  return (
    <div className="rounded-xl border border-white/[0.06] bg-slate-800/30 p-3">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
        🧠 ML Brain
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-slate-900/40">
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-emerald-400 font-bold">✅ {stats.allowed}</span>
          <span className="text-[9px] text-slate-500">allowed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-red-400 font-bold">❌ {stats.blocked}</span>
          <span className="text-[9px] text-slate-500">blocked</span>
        </div>
        {stats.total > 0 && (
          <div className="ml-auto text-[9px] font-bold text-slate-400">
            {stats.block_rate_pct}% filtered
          </div>
        )}
      </div>

      {/* Score bars */}
      {(stats.avg_allowed_score !== null || stats.avg_blocked_score !== null) && (
        <div className="flex gap-2 mb-3">
          {stats.avg_allowed_score !== null && (
            <div className="flex-1 text-center p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-[11px] font-bold text-emerald-400">{Math.round(stats.avg_allowed_score * 100)}%</div>
              <div className="text-[8px] text-slate-500">avg allowed</div>
            </div>
          )}
          {stats.avg_blocked_score !== null && (
            <div className="flex-1 text-center p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="text-[11px] font-bold text-red-400">{Math.round(stats.avg_blocked_score * 100)}%</div>
              <div className="text-[8px] text-slate-500">avg blocked</div>
            </div>
          )}
        </div>
      )}

      {/* Recent decisions */}
      <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        Recent Decisions
      </div>
      <div className="space-y-1.5">
        {decisions.map((d, i) => (
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
        ))}
      </div>
    </div>
  );
}
