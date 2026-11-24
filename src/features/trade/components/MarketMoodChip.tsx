import { useEffect, useState } from "react";

interface Leverage { signal: string; label: string; lines: string[] }
interface Mood { state: string; emoji: string; label: string; advice: string; lines: string[]; waiting: number; waitingBefore: number | null; leverage?: Leverage }

/** Small traffic-light chip: is it a good time to add USDC? Members and admin only; shows nothing otherwise. */
const MarketMoodChip = ({ wallet }: { wallet: string }) => {
  const [mood, setMood] = useState<Mood | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/community/market-mood?wallet=${wallet}&admin_wallet=${wallet}`);
        if (!res.ok) { if (live) setMood(null); return; }
        const j = (await res.json()) as Mood;
        if (live && j && j.state) setMood(j);
      } catch { /* chip simply stays hidden */ }
    };
    void load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { live = false; clearInterval(t); };
  }, [wallet]);

  if (!mood) return null;
  const w = mood.waiting;
  const trend = mood.waitingBefore != null && mood.waitingBefore !== w ? ` (${w > mood.waitingBefore ? "up" : "down"} from ${mood.waitingBefore})` : "";

  return (
    <div className="relative normal-case tracking-normal flex flex-col items-center">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-slate-200 leading-none"
        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
        <span>{mood.emoji}</span><span>{mood.label}</span>
      </button>
      <div className="text-[10px] text-slate-500 mt-0.5">{w} buy{w === 1 ? "" : "s"} waiting for cash{trend}</div>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-9 z-20 w-[min(320px,86vw)] rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed shadow-xl"
          style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="font-bold text-slate-100 mb-1">{mood.emoji} {mood.label}</div>
          <p className="mb-2">{mood.advice}</p>
          <ul className="space-y-0.5 text-slate-400 list-disc pl-4">{mood.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          {mood.leverage && mood.leverage.signal !== "unknown" && mood.leverage.lines.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/[0.08]">
              <div className="font-bold text-slate-200 mb-0.5">
                {mood.leverage.signal === "washed_out" ? "🧹" : mood.leverage.signal === "crowded" ? "🔥" : mood.leverage.signal === "building" ? "📈" : "⚖️"} {mood.leverage.label}
              </div>
              <ul className="space-y-0.5 text-slate-400 list-disc pl-4">{mood.leverage.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              <div className="mt-1 text-[9px] text-slate-500">Leverage data is from Hyperliquid's public market. It adds context only and does not change what the bot buys.</div>
            </div>
          )}
          <p className="mt-2 text-[10px] text-slate-500">A rules-based reading of conditions, not a prediction. Adding USDC makes every waiting buy fire within minutes. Not financial advice.</p>
          <button onClick={() => setOpen(false)} className="mt-2 text-[10px] text-blue-400 underline">Close</button>
        </div>
      )}
    </div>
  );
};

export default MarketMoodChip;
