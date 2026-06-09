import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { FaSync } from "react-icons/fa";
import { useWallet } from "@hooks/useWallet";
import { fetchDeskBrief, type DeskBrief } from "@features/trade/services/tradeApi";

const dirColor = (d: string) => (d === "long" ? "#22c55e" : d === "short" ? "#ef4444" : "#94a3b8");
const dirIcon = (d: string) => (d === "long" ? "🟢" : d === "short" ? "🔴" : "⚪️");
const sevColor = (s: string) => (s === "high" ? "#ef4444" : s === "medium" ? "#f59e0b" : "#94a3b8");

const Desk = () => {
  const { walletAddress } = useWallet();
  const [brief, setBrief] = useState<DeskBrief | null>(null);
  const [history, setHistory] = useState<DeskBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<number>(0); // 0 = latest

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchDeskBrief(walletAddress || undefined, true);
    setBrief(res?.brief ?? null);
    setHistory(res?.history ?? []);
    setLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const active = picked === 0 ? brief : history[picked] ?? brief;
  const mc = active?.marketContext;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-20 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-100">☀️ BUDJU Desk</h1>
          <p className="text-[11px] md:text-xs text-slate-500">
            Daily AI briefing — guidance only, not financial advice
          </p>
        </div>
        <button
          onClick={load}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <FaSync size={13} className={`text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
        </div>
      ) : !active ? (
        <div className="text-center py-16 text-slate-500 text-sm">
          No brief yet. The first one lands each morning (~6am AEST). Check back soon. ☕
        </div>
      ) : (
        <>
          {/* Date / history selector */}
          {history.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 snap-x" style={{ scrollbarWidth: "thin" }}>
              {history.map((b, i) => (
                <button
                  key={b.createdAt || i}
                  onClick={() => setPicked(i)}
                  className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold snap-start"
                  style={{
                    background: picked === i ? "rgba(20,184,166,0.2)" : "rgba(255,255,255,0.04)",
                    color: picked === i ? "#2dd4bf" : "#94a3b8",
                    border: `1px solid ${picked === i ? "rgba(20,184,166,0.4)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  {b.date || (b.createdAt ? new Date(b.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : `#${i + 1}`)}
                  {i === 0 ? " · latest" : ""}
                </button>
              ))}
            </div>
          )}

          {/* Market context */}
          {mc && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-4 mb-4"
              style={{ background: "rgba(103,232,249,0.06)", border: "1px solid rgba(103,232,249,0.15)" }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-cyan-300/80 font-bold">Market</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: "rgba(103,232,249,0.15)", color: "#67e8f9" }}>{mc.regime}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: "#cbd5e1" }}>{mc.riskTone}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">{mc.summary}</p>
            </motion.div>
          )}

          {/* Ideas */}
          {active.ideas && active.ideas.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">💡 Ideas</div>
              <div className="grid md:grid-cols-2 gap-3 mb-5">
                {active.ideas.map((idea, i) => (
                  <motion.div
                    key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                    className="rounded-2xl p-4"
                    style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${dirColor(idea.direction)}33` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-100">{idea.coin}</span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: `${dirColor(idea.direction)}22`, color: dirColor(idea.direction) }}>
                          {dirIcon(idea.direction)} {idea.direction?.toUpperCase()}
                        </span>
                        {idea.leverage && <span className="text-[10px] text-slate-500">{idea.leverage}</span>}
                      </div>
                      <span className="text-sm font-bold font-mono" style={{ color: dirColor(idea.direction) }}>{idea.confidence}%</span>
                    </div>
                    {/* confidence bar */}
                    <div className="w-full h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, idea.confidence))}%`, background: dirColor(idea.direction) }} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                      <Field label="Entry" value={idea.entryZone} />
                      <Field label="Invalidation" value={idea.invalidation} color="#ef4444" />
                      <Field label="Target" value={idea.target} color="#22c55e" />
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{idea.rationale}</p>
                  </motion.div>
                ))}
              </div>
            </>
          )}

          {/* Contradictions (admin-full only) */}
          {active.contradictions && active.contradictions.length > 0 && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-amber-500/80 font-bold mb-2">⚠️ Position watch</div>
              <div className="space-y-2 mb-5">
                {active.contradictions.map((c, i) => (
                  <div key={i} className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                    <span className="text-sm font-bold" style={{ color: sevColor(c.severity) }}>{c.coin}</span>
                    <div className="flex-1">
                      <span className="text-[9px] font-bold uppercase mr-2" style={{ color: sevColor(c.severity) }}>{c.severity}</span>
                      <span className="text-xs text-slate-300">{c.alert}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Thesis */}
          {active.thesisOfWeek && (
            <div className="rounded-2xl p-4 mb-5" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}>
              <div className="text-[10px] uppercase tracking-wider text-purple-300/80 font-bold mb-1">🧭 Thesis of the week</div>
              <p className="text-sm text-slate-300 leading-relaxed">{active.thesisOfWeek}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-[10px] text-slate-600 text-center leading-relaxed mt-2">
            Synthesised by AI from market data, news & your notes · confidence is a subjective estimate ·
            every idea has an invalidation — size accordingly. <b>Not financial advice.</b>
            {active.notesConsidered ? ` · ${active.notesConsidered} of your notes considered` : ""}
          </div>
        </>
      )}
    </div>
  );
};

const Field = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div>
    <div className="text-slate-600 uppercase tracking-wider mb-0.5">{label}</div>
    <div className="font-bold font-mono" style={{ color: color || "#cbd5e1" }}>{value || "—"}</div>
  </div>
);

export default Desk;
