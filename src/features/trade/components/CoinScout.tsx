import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchScout, manageCoin, addCoinsBulk, greenTiers, ASSET_CONFIG, loadCoinConfig, type Scout, type ScoutCandidate } from "../services/tradeApi";
import type { AutoTrader } from "../services/autoTrader";

const Section = ({ title, color, count, defaultOpen = false, children }: { title: string; color: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="mb-2 rounded-lg" style={{ background: "rgba(255,255,255,0.025)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-2 py-1.5">
        <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color }}>{title} <span className="text-slate-500">({count})</span></span>
        {open ? <FaChevronDown size={9} className="text-slate-500" /> : <FaChevronRight size={9} className="text-slate-500" />}
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
};

const Notes = ({ items }: { items: { coin: string; why: string }[] }) => (
  <>
    {items.map((n) => (
      <div key={n.coin} className="text-[11px] text-slate-300"><b>{n.coin}</b> — <span className="text-slate-400">{n.why}</span></div>
    ))}
  </>
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
  const [hideAdded, setHideAdded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const r = await fetchScout(wallet, (d, t) => setProg([d, t]));
    setProg(null);
    // Coins already added before this view loaded are left out; ones added during this visit keep their "Added ✓" until the next refresh
    setHideAdded(new Set((r?.results ?? []).filter((c) => !!ASSET_CONFIG[c.code]).map((c) => c.code)));
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

  // Pair the worst coins that are still being bought with the best coins not added yet.
  const visible = (data?.results ?? []).filter((c) => !hideAdded.has(c.code));

  const swapPairs = () => {
    if (!data) return [] as { bad: { coin: string; perBuy?: number }; good: ScoutCandidate }[];
    const traded = autoTrader.tierAssignments || {};
    const bad = [...data.review.considerRemoving].filter((n) => (traded[n.coin] || []).length > 0).sort((a, b) => (a.perBuy ?? 0) - (b.perBuy ?? 0));
    const good = visible.filter((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0);
    return bad.slice(0, Math.min(bad.length, good.length, 6)).map((b, i) => ({ bad: b, good: good[i] }));
  };

  const swap = async (bad: string, good: ScoutCandidate) => {
    if (!window.confirm(`Swap ${bad} for ${good.code}?\n\n• ${bad} is taken out of all tiers — the bot stops buying it (and won't sell what you already hold).\n• ${good.code} is added and switched on for ${tiersLabel(greenTiers(good))}.`)) return;
    setAdding(good.code);
    setMsg("");
    const r = await manageCoin(wallet, "add", good.code, good.id, good.name);
    if (r.ok) {
      autoTrader.unassignCoin(bad);
      greenTiers(good).forEach((t) => autoTrader.assignCoin(good.code, t));
      setMsg(`✅ Swapped ${bad} → ${good.code}`);
      await loadCoinConfig();
      onChanged();
    } else {
      setMsg(`⛔ ${r.error || "Failed"}`);
    }
    setAdding(null);
  };

  const addAllGreen = async () => {
    const todo = visible.filter((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0);
    if (!todo.length) return;
    setBulk(true);
    setMsg("");
    const r = await addCoinsBulk(wallet, todo.map((c) => ({ code: c.code, cgId: c.id, name: c.name })));
    if (r.ok) {
      for (const c of todo) if (r.added.includes(c.code)) greenTiers(c).forEach((t) => autoTrader.assignCoin(c.code, t));
      setMsg(`✅ Added ${r.added.length} coin${r.added.length === 1 ? "" : "s"}, each switched on only for its green tiers${r.failed ? ` · ${r.failed} could not be confirmed by CoinGecko — tap Add all green again in a minute` : ""}`);
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
              <Section title="Consider removing" color="#ef4444" count={data.review.considerRemoving.length}><Notes items={data.review.considerRemoving} /></Section>
              <Section title="Working well — accumulate" color="#22c55e" count={data.review.keepStrong.length}><Notes items={data.review.keepStrong} /></Section>
              <Section title="Quiet" color="#94a3b8" count={data.review.quiet.length}><Notes items={data.review.quiet} /></Section>

              {swapPairs().length > 0 && (
                <Section title="Suggested swaps — bad for good" color="#f59e0b" count={swapPairs().length} defaultOpen>
                  <div className="space-y-1">
                    {swapPairs().map(({ bad, good }) => (
                      <div key={bad.coin} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                        <div className="text-[11px] text-slate-300 min-w-0">
                          <span className="text-red-400 font-bold">{bad.coin}</span> {bad.perBuy !== undefined ? `(${bad.perBuy.toFixed(1)}%)` : ""}
                          {" → "}
                          <span className="text-green-400 font-bold">{good.code}</span> (+{good.perBuy.toFixed(1)}%)
                        </div>
                        <button
                          onClick={() => swap(bad.coin, good)}
                          disabled={!!adding || bulk}
                          className="text-[11px] font-bold px-2 py-1 rounded bg-amber-500/20 text-amber-400 disabled:opacity-50 flex-shrink-0"
                        >
                          {adding === good.code ? "Swapping…" : "Swap"}
                        </button>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <div className="flex items-center justify-between mt-3 mb-1">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">New opportunities</div>
                {visible.some((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0) && (
                  <button onClick={addAllGreen} disabled={bulk || !!adding} className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/25 text-green-400 disabled:opacity-40">
                    {bulk ? "Adding…" : `Add all green (${visible.filter((c) => !ASSET_CONFIG[c.code] && greenTiers(c).length > 0).length})`}
                  </button>
                )}
              </div>
              {visible.length === 0 ? (
                <div className="text-[11px] text-slate-500">
                  {data.pending.length ? "Still testing — tap Refresh." : "Nothing new passes the test right now."}
                </div>
              ) : (
                <div className="space-y-1">
                  {visible.map((c) => (
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
