import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchOffloadPreview, offloadRun, type OffloadJob, type OffloadPreview as Preview } from "../services/tradeApi";

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const usd2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Shows, wallet by wallet, what a 50% or 75% offload would sell and buy; the red box runs it (typed confirmation). */
const OffloadPreview = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pct, setPct] = useState<"50" | "75">("50");
  const [bad, setBad] = useState<string[] | null>(null);
  const [targets, setTargets] = useState<string[] | null>(null);
  const [openWallet, setOpenWallet] = useState<string | null>(null);

  // ── Running the offload for real ──
  const [confirmText, setConfirmText] = useState("");
  const [job, setJob] = useState<OffloadJob | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState("");

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Sells now; waits for Swyftx balances to settle; then buys. Safe to resume: every order is saved as it is placed. */
  const drive = async (jobId: string) => {
    setRunning(true);
    try {
      for (let i = 0; i < 40; i++) {
        const r = await offloadRun(wallet, "sells", { jobId });
        if (!r || r.ok === false) { setRunMsg(`⛔ ${r?.error ?? "No answer from the server — tap Resume to check"}`); return; }
        setJob(r.job);
        if (!r.job || r.job.wallets.every((w) => w.status !== "sell_pending")) break;
      }
      for (let i = 0; i < 60; i++) {
        const r = await offloadRun(wallet, "buys", { jobId });
        if (!r || r.ok === false) { setRunMsg(`⛔ ${r?.error ?? "No answer from the server — tap Resume to check"}`); return; }
        setJob(r.job);
        if (!r.job || r.job.status === "finished") { setRunMsg("✅ Offload finished — see Activity for every trade."); return; }
        const waiting = Math.max(0, ...r.job.wallets.filter((w) => w.status === "sold").map((w) => w.buysReadyIn));
        setRunMsg(waiting > 0 ? `Sells done. Waiting ${waiting}s for Swyftx balances to settle before buying…` : "Buying…");
        await wait(waiting > 0 ? Math.min(waiting, 15) * 1000 : 1500);
      }
    } finally {
      setRunning(false);
    }
  };

  const startRun = async () => {
    setRunMsg("");
    const r = await offloadRun(wallet, "start", { pct: Number(pct), confirm: confirmText.trim(), bad: bad ?? undefined, targets: targets ?? undefined });
    if (!r || r.ok === false || !r.jobId) { setRunMsg(`⛔ ${r?.error ?? "Couldn't start"}`); return; }
    setJob(r.job);
    setConfirmText("");
    void drive(r.jobId);
  };

  const resume = async () => {
    const r = await offloadRun(wallet, "status");
    if (r?.job && r.job.status === "running") { setJob(r.job); void drive(r.job.id); }
    else setRunMsg(r?.job ? "That offload is finished." : "No offload is running.");
  };

  const load = async (b = bad, t = targets, fresh = false) => {
    setLoading(true);
    setFailed(false);
    const r = await fetchOffloadPreview(wallet, b ?? undefined, t ?? undefined, fresh);
    if (r) {
      setData(r);
      if (!b) setBad(r.bad);
      if (!t) setTargets(r.targets);
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  const flip = (list: string[], coin: string) => (list.includes(coin) ? list.filter((c) => c !== coin) : [...list, coin]);

  const tot = data?.totals[pct];

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🔍 Offload preview — see before selling</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            <b>The numbers below are a preview — nothing sells until you run it in the red box.</b> Shows what each wallet would sell of the "bad" coins at 50% or 75% and how that money would be split
            evenly across the "good" coins <i>inside the same wallet</i>. Same percentage for everyone.
          </p>
          <div className="flex items-center gap-2 mb-2">
            {(["50", "75"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPct(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ background: pct === p ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.05)", color: pct === p ? "#fbbf24" : "#94a3b8" }}
              >
                Sell {p}%
              </button>
            ))}
            <button onClick={() => load(bad, targets, true)} disabled={loading} className="text-[11px] text-slate-400 flex items-center gap-1">
              <FaSync size={10} className={loading ? "animate-spin" : ""} /> {loading ? "Reading every wallet…" : "Refresh"}
            </button>
          </div>
          {failed && <div className="text-xs text-red-400 mb-2">Couldn't load. Tap Refresh to try again.</div>}

          {data && tot && (
            <>
              <div className="rounded-lg px-3 py-2 mb-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="text-[11px] text-slate-300">
                  All {data.wallets.length} wallets at <b>{pct}%</b>: sells <b className="text-amber-300">{usd(tot.sell)}</b> → buys <b className="text-green-400">{usd(tot.buy)}</b>
                  {" "}· estimated {tot.pnl >= 0 ? "profit" : "loss"} locked in{" "}
                  <b style={{ color: tot.pnl >= 0 ? "#4ade80" : "#f87171" }}>{usd(Math.abs(tot.pnl))}</b>
                </div>
                <div className="text-[10px] text-slate-500">Profit/loss only counts coins with a recorded buy price. Fees (~1%) are held back.</div>
              </div>

              <div className="space-y-1 mb-2">
                {data.wallets.map((w) => {
                  const p = w.scenarios[pct];
                  const isOpen = openWallet === w.wallet;
                  return (
                    <div key={w.wallet} className="rounded-lg bg-white/[0.03]">
                      <button onClick={() => setOpenWallet(isOpen ? null : w.wallet)} className="w-full flex items-center justify-between px-2.5 py-2 text-left">
                        <span className="text-[12px] font-bold text-slate-200">{w.isAdmin ? "👑 You (admin)" : `Wallet ${w.short}`}</span>
                        <span className="text-[11px] text-slate-400">
                          sells <b className="text-amber-300">{usd2(p.sellTotal)}</b> → buys <b className="text-green-400">{p.buys.length}</b> coins
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-2.5 pb-2.5">
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Sells {pct}%</div>
                          {p.sells.length === 0 && <div className="text-[11px] text-slate-500">Nothing to sell here.</div>}
                          {p.sells.map((s) => (
                            <div key={s.coin} className="flex justify-between text-[11px] text-slate-300">
                              <span><b>{s.coin}</b> <span className="text-slate-500">holds {usd2(s.heldUsd)}</span></span>
                              <span>
                                sell {usd2(s.sellUsd)}
                                {s.pnlUsd !== null && <span style={{ color: s.pnlUsd >= 0 ? "#4ade80" : "#f87171" }}> ({s.pnlUsd >= 0 ? "+" : "−"}{usd2(Math.abs(s.pnlUsd))})</span>}
                              </span>
                            </div>
                          ))}
                          {p.skippedSells.length > 0 && (
                            <div className="text-[10px] text-amber-400 mt-1">
                              Too small to sell (under Swyftx's minimum): {p.skippedSells.map((s) => `${s.coin} ${usd2(s.sellUsd)}`).join(", ")}
                            </div>
                          )}
                          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mt-2 mb-1">
                            Buys with {usd2(p.proceeds)} (after fees)
                          </div>
                          {p.buys.length === 0 && <div className="text-[11px] text-slate-500">Not enough to buy anything (each buy must be at least $8).</div>}
                          {p.buys.map((b) => (
                            <div key={b.coin} className="flex justify-between text-[11px] text-slate-300">
                              <b>{b.coin}</b>
                              <span className="text-green-400">buy {usd2(b.buyUsd)}</span>
                            </div>
                          ))}
                          {p.skippedBuys.length > 0 && <div className="text-[10px] text-amber-400 mt-1">At the cap: {p.skippedBuys.map((s) => s.coin).join(", ")}</div>}
                          {p.staysUsdc > 0.5 && <div className="text-[10px] text-slate-500 mt-1">{usd2(p.staysUsdc)} stays as USDC.</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <div className="text-[11px] font-bold text-red-300 mb-1">Run it for real — sells {pct}% in every wallet above</div>
                <div className="text-[10px] text-slate-400 leading-relaxed mb-2">
                  Uses real money. Sells first, waits about 2 minutes for balances to settle, then buys. Keep this screen open until it says finished.
                  The amounts are re-checked at the moment it runs, so they can differ a little from the preview. To go ahead, type <b>OFFLOAD {pct}</b>.
                </div>
                <div className="flex gap-2">
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={`OFFLOAD ${pct}`}
                    disabled={running}
                    className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-200 outline-none"
                  />
                  <button
                    onClick={startRun}
                    disabled={running || confirmText.trim() !== `OFFLOAD ${pct}`}
                    className="px-3 rounded-lg text-xs font-bold bg-red-500/30 text-red-200 disabled:opacity-40"
                  >
                    {running ? "Running…" : "Start"}
                  </button>
                </div>
                <button onClick={resume} disabled={running} className="mt-2 text-[11px] text-slate-400 underline disabled:opacity-40">Resume / check an offload in progress</button>
                {runMsg && <div className="text-[11px] text-slate-200 mt-2">{runMsg}</div>}
                {job && (
                  <div className="mt-2 space-y-0.5">
                    {job.dryRun && <div className="text-[10px] text-amber-400">DRY RUN is on at the server — no orders are placed.</div>}
                    {job.wallets.map((w) => (
                      <div key={w.short} className="text-[11px] text-slate-300">
                        {w.isAdmin ? "👑 You" : w.short}: sold {w.sellsDone}/{w.sellsTotal} (${w.soldUsd.toLocaleString()}) · bought {w.buysDone}/{w.buysTotal} (${w.boughtUsd.toLocaleString()})
                        {w.status === "done" ? " ✅" : ""}
                        {[...w.sellsFailed, ...w.buysFailed].length > 0 && (
                          <span className="text-amber-400"> · issues: {[...w.sellsFailed, ...w.buysFailed].map((f) => `${f.coin} (${f.error})`).join(", ")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Coins to sell (tap to leave one out)</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {[...new Set([...(data.defaults.bad), ...(bad ?? [])])].map((c) => {
                  const on = (bad ?? data.bad).includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => { const nb = flip(bad ?? data.bad, c); setBad(nb); void load(nb, targets); }}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: on ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)", color: on ? "#f87171" : "#475569" }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Coins to buy (best first; tap to leave one out)</div>
              <div className="flex flex-wrap gap-1">
                {[...new Set([...(data.defaults.targets), ...(targets ?? [])])].map((c) => {
                  const on = (targets ?? data.targets).includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => { const nt = flip(targets ?? data.targets, c); setTargets(nt); void load(bad, nt); }}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: on ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)", color: on ? "#4ade80" : "#475569" }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {data.capUsd > 0 && <div className="text-[10px] text-slate-500 mt-2">Position cap {usd(data.capUsd)} per coin per wallet is applied.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OffloadPreview;
