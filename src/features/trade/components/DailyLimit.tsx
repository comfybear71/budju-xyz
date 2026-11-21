import { useEffect, useState } from "react";
import { fetchDailyLimit, saveDailyLimit, type DailyLimitInfo } from "../services/tradeApi";

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** Your own cap on how much the bot may BUY in any rolling 24 hours. Protects you in a crash. Each wallet sets its own. */
const DailyLimit = ({ wallet }: { wallet: string }) => {
  const [info, setInfo] = useState<DailyLimitInfo | null>(null);
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let live = true;
    void fetchDailyLimit(wallet).then((r) => { if (live && r) { setInfo(r); setValue(r.limit); } });
    return () => { live = false; };
  }, [wallet]);

  if (!info) return null;
  const changed = value !== info.limit;
  const pct = Math.min(100, info.limit > 0 ? (info.spent24h / info.limit) * 100 : 0);

  const save = async () => {
    setBusy(true);
    setMsg("");
    const r = await saveDailyLimit(wallet, value);
    setBusy(false);
    if (r) { setInfo(r); setValue(r.limit); setMsg("✅ Saved"); } else { setMsg("⛔ Couldn't save — try again"); }
  };

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-bold text-slate-200">🛡️ Daily buying limit</span>
        <span className="text-[12px] font-mono font-bold text-teal-300">{usd(value)}</span>
      </div>
      <div className="text-[10px] text-slate-400 mb-2 leading-snug">
        The most the bot will buy for you in any 24 hours. Bought in the last 24h: <b className="text-slate-200">{usd(info.spent24h)}</b> of {usd(info.limit)}.
      </div>
      <div className="w-full h-1.5 rounded-full mb-2 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? "#f59e0b" : "#2dd4bf" }} />
      </div>
      <input type="range" min={info.min} max={info.max} step={100} value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full accent-teal-400" />
      <div className="flex justify-between text-[9px] text-slate-500"><span>{usd(info.min)}</span><span>{usd(info.max)}</span></div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={save} disabled={busy || !changed} className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40" style={{ background: "rgba(59,130,246,0.25)", border: "1px solid rgba(59,130,246,0.45)", color: "#93c5fd" }}>
          {busy ? "Saving…" : "Save"}
        </button>
        {!info.isCustom && !msg && <span className="text-[10px] text-slate-500">Using the default ({usd(info.default)})</span>}
        {msg && <span className="text-[11px] text-slate-200">{msg}</span>}
      </div>
    </div>
  );
};

export default DailyLimit;
