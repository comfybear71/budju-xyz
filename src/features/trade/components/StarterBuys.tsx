import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { starterBuys, type StarterPlan } from "../services/tradeApi";

const StarterBuys = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(15);
  const [plan, setPlan] = useState<StarterPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const doPlan = async () => {
    setBusy(true);
    setErr("");
    setLog([]);
    const r = await starterBuys(wallet, "plan", amount);
    if (!r || r.error) setErr(r?.error || "Couldn't load the plan. Try again.");
    else setPlan(r as StarterPlan);
    setBusy(false);
  };

  const run = async () => {
    if (!plan || busy) return;
    if (!window.confirm(`Buy $${plan.amountUsd} of each of ${plan.willBuy.length} coins (about $${plan.totalUsd}) with REAL money in the admin Swyftx account?`)) return;
    setBusy(true);
    setErr("");
    setLog([]);
    let todo = [...plan.willBuy];
    let rounds = 0;
    while (todo.length && rounds < 12) {
      rounds++;
      const batch = todo.slice(0, 3);
      const r = await starterBuys(wallet, "execute", plan.amountUsd, batch);
      if (!r || r.ok === false) {
        setLog((l) => [...l, `⛔ ${r?.error || "No answer from the server — check Activity before trying again."}`]);
        break;
      }
      setLog((l) => [
        ...l,
        ...(r.placed ?? []).map((p) => `✅ Bought ${p.coin} $${p.usd}`),
        ...(r.failed ?? []).map((f) => `⛔ ${f.coin}: ${f.error}`),
        ...(r.skipped ?? []).map((s) => `⏭ ${s.coin}: ${s.why}`),
      ]);
      todo = todo.filter((c) => !batch.includes(c));
    }
    setPlan(null);
    setBusy(false);
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🌱 Starter buys — a small first position</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Buys a small amount of every coin in your tiers that the admin wallet doesn't hold yet. Never touches the $30 USDC buffer.
            You see the plan first and confirm before any money moves.
          </p>
          <div className="flex items-center gap-2 mb-2">
            {[10, 15, 20].map((a) => (
              <button
                key={a}
                onClick={() => { setAmount(a); setPlan(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: amount === a ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.05)", color: amount === a ? "#4ade80" : "#94a3b8" }}
              >
                ${a}
              </button>
            ))}
            <button onClick={doPlan} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40">
              {busy && !plan ? "Checking…" : "Show plan"}
            </button>
          </div>
          {err && <div className="text-xs text-red-400 mb-1">{err}</div>}
          {plan && (
            <div className="text-[11px] text-slate-300 leading-relaxed">
              <div>USDC available: <b>${plan.usdc}</b> (keeps ${plan.reserve} buffer)</div>
              <div>Would buy <b>{plan.willBuy.length}</b> coins × ${plan.amountUsd} = <b>${plan.totalUsd}</b></div>
              {plan.willBuy.length > 0 && <div className="text-slate-400">{plan.willBuy.join(", ")}</div>}
              {plan.cannotAfford.length > 0 && <div className="text-amber-400">Not enough USDC for: {plan.cannotAfford.join(", ")}</div>}
              {plan.wanted.length === 0 && <div className="text-slate-500">Nothing to buy — every coin in your tiers already has a balance.</div>}
              {!plan.tradingEnabled && <div className="text-red-400">Trading is switched off on the server.</div>}
              {plan.willBuy.length > 0 && plan.tradingEnabled && (
                <button onClick={run} disabled={busy} className="mt-2 px-3 py-2 rounded-lg text-xs font-bold bg-green-500/25 text-green-400 disabled:opacity-40">
                  {busy ? "Buying…" : `Buy now — $${plan.totalUsd}`}
                </button>
              )}
            </div>
          )}
          {log.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {log.map((l, i) => <div key={i} className="text-[11px] text-slate-300">{l}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StarterBuys;
