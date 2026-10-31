import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { fetchHealthCheck, type HealthCheck as Health, type HealthItem } from "../services/tradeApi";

const LABELS: [keyof Health, string][] = [
  ["database", "Database"],
  ["coingecko", "CoinGecko (prices)"],
  ["adminSwyftx", "Your Swyftx account (wallet key)"],
  ["masterSwyftxKey", "Server Swyftx key (Holdings screen)"],
  ["prices", "Price lookup"],
  ["leaderboard", "Leaderboard (all wallets)"],
];

/** Admin: one tap to see which part of the app is slow or failing. */
const HealthCheck = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    const r = await fetchHealthCheck(wallet);
    setData(r);
    setFailed(!r);
    setBusy(false);
  };

  const copy = () => {
    try {
      void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🩺 Check connections (why is it slow?)</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40">
              {busy ? "Testing… up to a minute" : "Run check"}
            </button>
            {data && <button onClick={copy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-slate-400">Copy details</button>}
          </div>
          {failed && <div className="text-xs text-red-400">No answer from the server within a minute — that itself means it is overloaded. Try again shortly.</div>}
          {data && (
            <div className="space-y-1">
              {LABELS.map(([k, label]) => {
                const it = data[k] as HealthItem | undefined;
                if (!it) return null;
                const slow = it.seconds >= 8;
                return (
                  <div key={k} className="text-[11px] text-slate-300 flex items-start gap-2">
                    <span>{!it.ok ? "⛔" : slow ? "🐢" : "✅"}</span>
                    <span>
                      <b>{label}</b> — {it.seconds}s {it.ok ? `· ${it.detail ?? "ok"}` : `· ${it.error}`}
                    </span>
                  </div>
                );
              })}
              <div className="text-[10px] text-slate-500 pt-1">
                {data.wallets} wallets with keys · CoinGecko paid key: {data.hasCoinGeckoKey ? "yes" : "NO (free tier — easily rate-limited)"}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HealthCheck;
