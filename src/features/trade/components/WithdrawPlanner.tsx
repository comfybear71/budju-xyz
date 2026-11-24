import { useState } from "react";
import { FaTimes } from "react-icons/fa";
import { fetchWithdrawPlan, type WithdrawPlan } from "../services/tradeApi";
import RankBadge from "./RankBadge";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  wallet: string;
}

const usd = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qty = (n: number) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));

/**
 * Withdraw planner: "I want to take $X out". It picks cash first, then the weakest coins, and shows the fees and the gain or loss on
 * each sale. It only PLANS: nothing is sold or moved from here. Untick (Keep) any coin and the plan is redone without it.
 */
const WithdrawPlanner = ({ isOpen, onClose, wallet }: Props) => {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"AUD" | "USDC">("AUD");
  const [preferLosses, setPreferLosses] = useState(false);
  const [kept, setKept] = useState<string[]>([]);
  const [plan, setPlan] = useState<WithdrawPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const money = (n: number) => (currency === "AUD" ? `A$${Math.round(n).toLocaleString()}` : `$${Math.round(n).toLocaleString()} USDC`);

  const run = async (excl: string[] = kept, losses: boolean = preferLosses) => {
    const n = Number(amount);
    if (!(n > 0)) {
      setPlan({ error: "Enter how much you want to take out." } as WithdrawPlan);
      return;
    }
    setBusy(true);
    setCopied(false);
    setPlan(await fetchWithdrawPlan(wallet, n, currency, losses, excl));
    setBusy(false);
  };

  const keep = (coin: string) => {
    const next = [...kept, coin];
    setKept(next);
    void run(next);
  };
  const unkeep = (coin: string) => {
    const next = kept.filter((c) => c !== coin);
    setKept(next);
    void run(next);
  };

  const copy = async () => {
    if (!plan || plan.error) return;
    const lines = [
      `Withdraw plan: ${money(plan.amount)} (${new Date().toLocaleDateString()})`,
      ...plan.cash.map((c) => `Use cash: ${c.currency} ${c.amount.toLocaleString()}`),
      ...plan.rows.map((r) => `SELL ${r.coin} ${qty(r.qty)} (about ${usd2(r.sellUsd)})${r.partial ? " partial" : ""}`),
      `Estimated fees ${usd2(plan.totals.feesUsd)}, you'd receive about ${money(plan.totals.netInCurrency)}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
    } catch { /* clipboard blocked: nothing to do */ }
  };

  const t = plan && !plan.error ? plan.totals : null;

  return (
    <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
      <div className="absolute inset-x-0 bottom-0 top-14 mx-auto w-full max-w-[460px] md:max-w-2xl bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20">
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: "#0a0a1a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="text-base font-bold text-slate-200">💸 Withdraw planner</span>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <FaTimes size={14} className="text-slate-400" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Tell me how much you want to take out. I'll use your cash first, then pick the weakest coins to sell and keep the good ones. <b className="text-slate-200">This only makes a plan. Nothing is sold.</b>
          </p>

          <div className="rounded-xl p-3 space-y-2.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex gap-2">
              <input
                type="number" inputMode="decimal" min="0" placeholder="Amount" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-mono text-slate-100 outline-none"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              {(["AUD", "USDC"] as const).map((c) => (
                <button key={c} onClick={() => { setCurrency(c); setPlan(null); }}
                  className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: currency === c ? "rgba(59,130,246,0.25)" : "rgba(255,255,255,0.05)", border: `1px solid ${currency === c ? "rgba(59,130,246,0.5)" : "rgba(255,255,255,0.1)"}`, color: currency === c ? "#93c5fd" : "#94a3b8" }}>
                  {c}
                </button>
              ))}
            </div>
            <label className="flex items-start gap-2 text-[11px] text-slate-400 leading-snug">
              <input type="checkbox" checked={preferLosses} onChange={(e) => { setPreferLosses(e.target.checked); if (plan && !plan.error) void run(kept, e.target.checked); }} className="mt-0.5" />
              <span>Sell coins that are at a loss first (a loss can offset gains for tax; this is information only, not tax advice)</span>
            </label>
            <button onClick={() => run()} disabled={busy} className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-50" style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.45)", color: "#86efac" }}>
              {busy ? "Working it out…" : "Make my plan"}
            </button>
          </div>

          {plan?.error && <div className="text-xs text-red-300 rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}>{plan.error}</div>}

          {plan && t && (
            <>
              <div className="rounded-xl p-3 text-[12px] text-slate-200 leading-relaxed" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.25)" }}>
                To get <b>{money(plan.amount)}</b>
                {plan.cash.length > 0 && <> I'd use <b>{usd(t.cashUsedUsd)}</b> of your cash</>}
                {t.coinCount > 0 && <>{plan.cash.length > 0 ? " and" : " I'd"} sell <b>{t.coinCount} coin{t.coinCount === 1 ? "" : "s"}</b> (about {usd(t.coinsSoldUsd)})</>}
                {t.coinCount === 0 && plan.cash.length > 0 && <>. Nothing needs selling.</>}.
                {" "}Estimated fees <b>{usd2(t.feesUsd)}</b>, so you'd receive about <b className="text-green-300">{money(t.netInCurrency)}</b>.
                {t.shortfallUsd > 0.5 && (
                  <div className="mt-1.5 text-amber-300">⚠️ Your account can't cover all of it. You'd be about {money(t.shortfallInCurrency)} short.</div>
                )}
              </div>

              {plan.cash.length > 0 && (
                <div className="rounded-xl p-3 text-[11px] text-slate-300 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Cash used first</div>
                  {plan.cash.map((c) => (
                    <div key={c.currency} className="flex justify-between">
                      <span>{c.currency} {c.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      <span className="text-slate-500">{c.converted ? `one conversion trade, fee ${usd2(c.feeUsd)}` : "no fee"}</span>
                    </div>
                  ))}
                </div>
              )}

              {plan.rows.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Coins to sell, weakest first</div>
                  {plan.rows.map((r) => (
                    <div key={r.coin} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[13px] font-bold text-slate-100">{r.coin}</span>
                          <RankBadge code={r.coin} />
                          {r.partial && <span className="text-[9px] text-slate-500">part</span>}
                        </div>
                        <div className="text-right">
                          <div className="text-[13px] font-mono font-bold text-slate-100">{usd2(r.sellUsd)}</div>
                          <div className="text-[9px] text-slate-500">{qty(r.qty)} {r.coin}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="text-[10px] text-slate-500 leading-snug">{r.tags.join(" · ")}</div>
                        <div className="text-[10px] text-right whitespace-nowrap">
                          <span className="text-slate-500">fee {usd2(r.feeUsd)}</span>
                          {r.pnlUsd !== null && <span className="ml-2 font-mono" style={{ color: r.pnlUsd < 0 ? "#f87171" : "#4ade80" }}>{r.pnlUsd < 0 ? "loss" : "gain"} {usd2(Math.abs(r.pnlUsd))}</span>}
                        </div>
                      </div>
                      <button onClick={() => keep(r.coin)} disabled={busy} className="mt-1 text-[10px] font-bold text-blue-300 disabled:opacity-50">Keep this one instead</button>
                    </div>
                  ))}
                </div>
              )}

              {(t.gainsUsd !== 0 || t.lossesUsd !== 0) && (
                <div className="rounded-xl p-3 text-[11px] text-slate-300 leading-relaxed" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  Selling these would realise gains of <b className="text-green-300">{usd(t.gainsUsd)}</b> and losses of <b className="text-red-300">{usd(Math.abs(t.lossesUsd))}</b>, net <b>{usd(t.realisedUsd)}</b> compared with what the bot paid. For information only, not tax advice.
                </div>
              )}

              {kept.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center text-[10px] text-slate-500">
                  Keeping:
                  {kept.map((c) => (
                    <button key={c} onClick={() => unkeep(c)} className="px-2 py-0.5 rounded-full text-slate-300" style={{ background: "rgba(255,255,255,0.06)" }}>{c} ✕</button>
                  ))}
                </div>
              )}

              {plan.skipped.length > 0 && (
                <div className="text-[10px] text-slate-500 leading-snug">
                  Too small to sell on their own: {plan.skipped.slice(0, 12).map((s) => s.coin).join(", ")}{plan.skipped.length > 12 ? ` and ${plan.skipped.length - 12} more` : ""} (under ${plan.assumptions.minSellUsd} each).
                </div>
              )}

              <button onClick={copy} className="w-full py-2 rounded-xl text-xs font-bold text-slate-200" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                {copied ? "✅ Copied" : "Copy this list"}
              </button>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                Fees are estimates: Swyftx's standard {plan.assumptions.tradeFeePct}% per trade (lower if you trade a lot) plus a spread that is wider on small coins
                ({Object.entries(plan.assumptions.spreadPctByGroup).map(([g, p]) => `${g} ${p}%`).join(", ")}). Getting AUD costs a second trade (USDC to AUD, about {plan.assumptions.tradeFeePct + plan.assumptions.fxSpreadPct}%)
                on anything that wasn't already AUD. Withdrawing USDC is cheaper. The bank withdrawal itself is done in Swyftx. Prices move, so the real figures will differ a little.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WithdrawPlanner;
