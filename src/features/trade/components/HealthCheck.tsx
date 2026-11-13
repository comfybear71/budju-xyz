import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { fetchHealthCheck, fetchKeyEncryption, type HealthCheck as Health, type HealthItem, type KeyEncryptionStatus } from "../services/tradeApi";

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

  const [holdings, setHoldings] = useState<string | null>(null);
  const [enc, setEnc] = useState<KeyEncryptionStatus | null>(null);
  const [encBusy, setEncBusy] = useState(false);
  const checkEnc = async (runIt: boolean) => {
    setEncBusy(true);
    setEnc(await fetchKeyEncryption(wallet, runIt));
    setEncBusy(false);
  };

  // The Holdings screen's own path: browser -> /api/proxy -> Swyftx. Say exactly what comes back.
  const testHoldings = async () => {
    const t = Date.now();
    try {
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: "/portfolio/" }),
      });
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      const body = await res.json().catch(() => ({}));
      setHoldings(res.ok ? `✅ Holdings request OK — ${(body.assets ?? []).length} assets · ${secs}s` : `⛔ Holdings request failed — HTTP ${res.status}: ${body?.error ?? "no message"} · ${secs}s`);
    } catch (e) {
      setHoldings(`⛔ Holdings request failed — ${String(e)}`);
    }
  };

  const run = async () => {
    setBusy(true);
    setFailed(false);
    setHoldings(null);
    void testHoldings();
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
          {holdings && <div className="text-[11px] text-slate-200 mb-1">{holdings}</div>}
          <div className="rounded-lg p-2 mb-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="text-[11px] font-bold text-slate-300 mb-1">🔐 Saved Swyftx key encryption</div>
            <div className="flex items-center gap-2">
              <button onClick={() => checkEnc(false)} disabled={encBusy} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/10 text-slate-200 disabled:opacity-40">Check</button>
              {enc && enc.onPrevious > 0 && (
                <button onClick={() => checkEnc(true)} disabled={encBusy} className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-yellow-200 disabled:opacity-40" style={{ background: "rgba(250,204,21,0.18)" }}>Re-encrypt now</button>
              )}
              {encBusy && <span className="text-[11px] text-slate-500">Working…</span>}
            </div>
            {enc && (
              <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                On the current secret: <b>{enc.onCurrent}</b> · still on the previous secret: <b>{enc.onPrevious}</b> · unreadable: <b style={{ color: enc.unreadable ? "#f87171" : undefined }}>{enc.unreadable}</b>
                {enc.ran ? <> · re-encrypted just now: <b>{enc.migratedNow}</b></> : null}
                <br />
                Previous secret setting: {enc.previousSecretSet ? "present" : "not set"}.{" "}
                {enc.onPrevious === 0 && enc.unreadable === 0 ? "All keys are on the current secret — you can remove the previous one." : null}
              </div>
            )}
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
