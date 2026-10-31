import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchScout, manageCoin, addCoinsBulk, greenTiers, ASSET_CONFIG, loadCoinConfig, type Scout, type ScoutCandidate } from "../services/tradeApi";
import type { AutoTrader } from "../services/autoTrader";

const Notes = ({ title, color, items }: { title: string; color: string; items: { coin: string; why: string }[] }) =>
  items.length === 0 ? null : (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color }}>{title}</div>
      {items.map((n) => (
        <div key={n.coin} className="text-[11px] text-slate-300"><b>{n.coin}</b> — <span className="text-slate-400">{n.why}</span></div>
      ))}
    </div>
  );

const CoinScout = ({ wallet, autoTrader, onChanged }: { wallet: string; autoTrader: AutoTrader; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Scout | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const r = await fetchScout(wallet, (d, t) => setProg([d, t]));
    setProg(null);
    setData(r);
    setFailed(!r);
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  const tiersLabel = (t: number[]) => (t.length ? t.map((x) => `T${x}`).join("+") : "no tier");

  const add = async (c: ScoutCandidate) => {
    setAdding(c.code);
    setMsg("");
    const r = await manageCoin(wallet, "add", c.code, c.id, c.name);
    if (r.ok) {
      const tiers = greenTiers(c);
      tiers.forEach((t) => autoTrader.assignCoin(c.code, t));
      setMsg(`✅ ${c.code} added to the coin list and switched on for ${tiersLabel(tiers)}`);
      await loadCoinConfig();
      onChanged();
    } else {
      setMsg(`⛔ ${r.error || "Failed"}`);
    }
    setAdding(null);
  };

  const addAllGreen = async () => {
    const todo = (data?.results ?? []).filter((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0);
    if (!todo.length) return;
    setBulk(true);
    setMsg("");
    const r = await addCoinsBulk(wallet, todo.map((c) => ({ code: c.code, cgId: c.id, name: c.name })));
    if (r.ok) {
      for (const c of todo) if (r.added.includes(c.code)) greenTiers(c).forEach((t) => autoTrader.assignCoin(c.code, t));
      setMsg(`✅ Added ${r.added.length} coin${r.added.length === 1 ? "" : "s"}, each switched on only for its green tiers`);
      await loadCoinConfig();
      onChanged();
    } else {
      setMsg(`⛔ ${r.error || "Failed"}`);
    }
    setBulk(false);
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🔭 Coin Scout — keep, drop or add</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <button onClick={load} disabled={loading} className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
            <FaSync size={10} className={loading ? "animate-spin" : ""} />
            {loading ? (prog ? `Testing new coins ${prog[0]}/${prog[1]}…` : "Working…") : "Refresh"}
          </button>
          {msg && <div className="text-xs text-slate-200 rounded-lg px-2 py-1.5 mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>{msg}</div>}
          {failed && <div className="text-xs text-red-400">Couldn't load the scout. Tap Refresh to try again.</div>}
          {data?.error && <div className="text-xs text-amber-400 mb-2">{data.error}</div>}
          {data && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Your current coins</div>
              <Notes title="Consider removing" color="#ef4444" items={data.review.considerRemoving} />
              <Notes title="Working well — accumulate" color="#22c55e" items={data.review.keepStrong} />
              <Notes title="Quiet" color="#94a3b8" items={data.review.quiet} />

              <div className="flex items-center justify-between mt-3 mb-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">New opportunities</div>
                {data.results.some((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0) && (
                  <button onClick={addAllGreen} disabled={bulk || !!adding} className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/25 text-green-400 disabled:opacity-40">
                    {bulk ? "Adding…" : `Add all green (${data.results.filter((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0).length})`}
                  </button>
                )}
              </div>
              {data.results.length === 0 ? (
                <div className="text-[11px] text-slate-500">
                  {data.pending.length ? "Still testing — tap Refresh." : "Nothing new passes the test right now."}
                </div>
              ) : (
                <div className="space-y-1">
                  {data.results.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                      <div className="min-w-0 text-[11px] text-slate-300">
                        <b>{c.code}</b> · {c.name} {c.rank ? <span className="text-slate-500">#{c.rank}</span> : null}
                        <div className="text-slate-500">
                          {c.perBuy >= 0 ? "+" : ""}{c.perBuy.toFixed(1)}% per buy · {c.buys} dips · 1y {c.change1y >= 0 ? "+" : ""}{c.change1y.toFixed(0)}% · {c.advice}
                        </div>
                      </div>
                      <button
                        onClick={() => add(c)}
                        disabled={!!ASSET_CONFIG[c.code] || adding === c.code || bulk}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/20 text-green-400 disabled:opacity-60 flex-shrink-0 min-w-[64px]"
                      >
                        {ASSET_CONFIG[c.code] ? "Added ✓" : adding === c.code ? "Adding…" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Tests big, liquid coins ({data.swyftxChecked ? "listed on Swyftx" : "Swyftx list could not be checked — confirm it's listed before adding"}) with the same
                tier rules as the Dip Report. A good past year is not a promise. Nothing is added unless you tap Add.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CoinScout;
