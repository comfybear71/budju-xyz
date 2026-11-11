import { useEffect, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

type Tier = { on: boolean; dip: number; sell: number; spend: number };
type SellMode = "fixed" | "trail" | "never";
interface Setup { tiers: Tier[]; sell: SellMode; trail: number; base: number; weekly: number; start: number; fee: number }
interface AllStats { coinsTested: number; coinsVsDca: number; h1: number; h2: number; beatDca: number; costVsDca: number; idlePct: number; avgTrades: number; ret: number; dcaRet: number }
interface Single {
  coin: string; prices: number[]; days: number; qty: number; dcaQty: number; qtyVsDca: number; ret: number; dcaRet: number;
  costPerCoin: number | null; dcaCostPerCoin: number; idlePct: number; trades: number;
  trace: { events: [number, "buy" | "sell", number][]; equity: number[]; dcaEquity: number[]; avgCost: number[] };
}
interface Preset { key: string; label: string; group: string; coinsVsDca: number; h1: number; h2: number }
interface Found { coinsVsDca: number; h1: number; h2: number; idlePct: number; costVsDca: number; wins: boolean; plain: string; setup: Setup }
interface Search { tried?: number; coins?: number; winners?: number; best?: Found[]; text?: string; error?: string }
interface Resp { coins: string[]; all?: AllStats; single?: Single; presets?: Preset[]; verdict?: string; error?: string }

const TODAY: Setup = {
  tiers: [{ on: true, dip: 5, sell: 12.5, spend: 5 }, { on: true, dip: 8.5, sell: 15, spend: 10 }, { on: true, dip: 15, sell: 20, spend: 15 }],
  sell: "fixed", trail: 5, base: 0, weekly: 25, start: 1000, fee: 0.5,
};
const withTiers = (f: (t: Tier, i: number) => Tier): Setup => ({ ...TODAY, tiers: TODAY.tiers.map(f) });
const IDEAS: { label: string; make: () => Setup }[] = [
  { label: "Today's setup", make: () => TODAY },
  { label: "Never sell", make: () => ({ ...TODAY, sell: "never" }) },
  { label: "Trailing sell 5%", make: () => ({ ...TODAY, sell: "trail", trail: 5 }) },
  { label: "Sell higher (+20/25/30)", make: () => withTiers((t, i) => ({ ...t, sell: [20, 25, 30][i] })) },
  { label: "Smaller dips (-3/-6/-12)", make: () => withTiers((t, i) => ({ ...t, dip: [3, 6, 12][i] })) },
  { label: "Bigger buys (10/15/25%)", make: () => withTiers((t, i) => ({ ...t, spend: [10, 15, 25][i] })) },
  { label: "Buy 50% of top-ups at once", make: () => ({ ...TODAY, base: 50 }) },
  { label: "Combo: bigger buys + 50% base", make: () => ({ ...withTiers((t, i) => ({ ...t, spend: [10, 15, 25][i] })), base: 50 }) },
];

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const col = (n: number) => (n >= 0 ? "#4ade80" : "#f87171");

const Slider = ({ label, value, min, max, step, unit, onChange, disabled }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; disabled?: boolean }) => (
  <label className="block" style={{ opacity: disabled ? 0.35 : 1 }}>
    <div className="flex justify-between text-[11px] text-slate-400"><span>{label}</span><span className="font-mono font-bold text-slate-100">{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-teal-400" />
  </label>
);

const Card = ({ title, value, sub, color }: { title: string; value: string; sub?: string; color?: string }) => (
  <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{title}</div>
    <div className="text-lg font-bold font-mono" style={{ color: color || "#e2e8f0" }}>{value}</div>
    {sub && <div className="text-[10px] text-slate-500 leading-tight">{sub}</div>}
  </div>
);

/** Price line with your buys (green) and sells (red), plus your average cost. */
const PriceChart = ({ s }: { s: Single }) => {
  const W = 320, H = 150;
  const p = s.prices;
  const avg = s.trace.avgCost;
  const vals = [...p, ...avg.filter((v) => v > 0)];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i: number) => (i / (p.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const line = p.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const avgPts = avg.map((v, i) => (v > 0 ? `${x(i + 1).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
      <polyline points={line} fill="none" stroke="#38bdf8" strokeWidth="1.2" />
      {avgPts && <polyline points={avgPts} fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 2" />}
      {s.trace.events.map(([i, side, price], k) => (
        <circle key={k} cx={x(i)} cy={y(price)} r={3} fill={side === "buy" ? "#22c55e" : "#ef4444"} stroke="#0b1220" strokeWidth="0.8" />
      ))}
    </svg>
  );
};

/** Your account value with the bot's rules vs the same money just buying every week. */
const ValueChart = ({ s }: { s: Single }) => {
  const W = 320, H = 110;
  const a = s.trace.equity, b = s.trace.dcaEquity;
  const lo = Math.min(...a, ...b), hi = Math.max(...a, ...b);
  const x = (i: number) => (i / (a.length - 1)) * W;
  const y = (v: number) => H - 5 - ((v - lo) / (hi - lo || 1)) * (H - 10);
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
      <polyline points={pts(b)} fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="3 2" />
      <polyline points={pts(a)} fill="none" stroke="#2dd4bf" strokeWidth="1.6" />
    </svg>
  );
};

const AccumLab = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<Setup>(TODAY);
  const [coin, setCoin] = useState("ALL");
  const [data, setData] = useState<Resp | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [info, setInfo] = useState(true);
  const [coinList, setCoinList] = useState<string[]>([]);
  const seq = useRef(0);
  const [search, setSearch] = useState<Search | null>(null);
  const [searching, setSearching] = useState(false);
  const findBest = async () => {
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/lab-search?wallet=${wallet}&admin_wallet=${wallet}&weekly=${setup.weekly}&start=${setup.start}&fee=${setup.fee}`);
      setSearch(res.ok ? ((await res.json()) as Search) : { error: "Search failed — try again." });
    } catch {
      setSearch({ error: "Search failed — try again." });
    }
    setSearching(false);
  };

  const query = useMemo(() => {
    const on = setup.tiers.filter((t) => t.on).map((t) => `${t.dip}:${t.sell}:${t.spend}:1`).join(",");
    return `wallet=${wallet}&admin_wallet=${wallet}&coin=${coin}&tiers=${on}&sell=${setup.sell}&trail=${setup.trail}&base=${setup.base}&weekly=${setup.weekly}&start=${setup.start}&fee=${setup.fee}`;
  }, [setup, coin, wallet]);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      setFailed(false);
      try {
        const res = await fetch(`/api/admin/lab?${query}`);
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as Resp;
        if (mine === seq.current) {
          setData(j);
          if (Array.isArray(j.coins) && j.coins.length) setCoinList(j.coins);
        }
      } catch {
        if (mine === seq.current) setFailed(true);
      }
      if (mine === seq.current) setBusy(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [query, open]);

  const setTier = (i: number, patch: Partial<Tier>) => setSetup((s) => ({ ...s, tiers: s.tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) }));
  const t1 = setup.tiers.find((t) => t.on);
  const headline = data?.all ?? (data?.single ? { coinsVsDca: data.single.qtyVsDca * 100, h1: NaN, h2: NaN, idlePct: data.single.idlePct * 100, avgTrades: data.single.trades, costVsDca: data.single.costPerCoin ? (data.single.costPerCoin / data.single.dcaCostPerCoin - 1) * 100 : 0, beatDca: 0, coinsTested: 1, ret: data.single.ret * 100, dcaRet: data.single.dcaRet * 100 } : null);
  const bars = useMemo(() => {
    if (!data?.presets) return [];
    const rows = data.presets.map((p) => ({ label: p.label, v: p.coinsVsDca, you: false }));
    if (data.all) rows.push({ label: "★ YOUR SETUP", v: data.all.coinsVsDca, you: true });
    return rows.sort((a, b) => b.v - a.v);
  }, [data]);
  const bmax = Math.max(1, ...bars.map((b) => Math.abs(b.v)));

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🔬 Accumulation Lab — tweak it, see it</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <button onClick={() => setInfo(!info)} className="text-[11px] font-bold text-teal-300 underline">{info ? "Hide" : "Show"} how the bot's rules work</button>
          {info && t1 && (
            <div className="rounded-lg px-3 py-2 text-[11px] text-slate-300 leading-relaxed" style={{ background: "rgba(20,184,166,0.07)", border: "1px solid rgba(20,184,166,0.2)" }}>
              <b>Buy:</b> when the price drops <b>{t1.dip}%</b> below its reference, Tier 1 spends <b>{t1.spend}%</b> of your cash on that coin, then waits for another {t1.dip}% drop.<br />
              <b>Sell:</b> the sell level is <b>{t1.sell}%</b> above the reference. It is measured from the reference price, not from your dip buy, and a dip buy never lowers it — so a coin bought at -{t1.dip}% needs to climb about {((1 + t1.sell / 100) / (1 - t1.dip / 100) * 100 - 100).toFixed(1)}% from that buy to sell.
              At the sell level it sells <b>{(t1.spend * 0.833).toFixed(1)}%</b> of what you hold of that coin (never below your average cost).{" "}
              {setup.sell === "trail" ? <>With <b>trailing</b> on, it doesn't sell at the level — it waits, tracks the highest price, and sells when the price falls <b>{setup.trail}%</b> from that high.</> : setup.sell === "never" ? <>With <b>never sell</b> on, it only ever buys.</> : null}<br />
              <b>Tiers 2 and 3</b> do the same with deeper dips, so a crash buys three times at lower prices.
            </div>
          )}

          <div className="rounded-lg p-2" style={{ background: "rgba(250,204,21,0.06)", border: "1px solid rgba(250,204,21,0.25)" }}>
            <button onClick={findBest} disabled={searching} className="px-3 py-1.5 rounded-lg text-xs font-bold text-yellow-200" style={{ background: "rgba(250,204,21,0.18)", border: "1px solid rgba(250,204,21,0.4)" }}>
              {searching ? "Trying 144 setups… (about 10 seconds)" : "🔍 Find the best setup for me"}
            </button>
            {search?.error && <div className="text-xs text-red-400 mt-1">{search.error}</div>}
            {search?.text && <div className="text-[11px] text-slate-200 mt-2 leading-relaxed">{search.text}</div>}
            {search?.best?.map((r, i) => (
              <div key={i} className="mt-2 rounded-lg p-2 text-[11px]" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${r.wins ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.08)"}` }}>
                <div className="text-slate-200 leading-snug">{r.wins ? "✅ " : ""}{r.plain}</div>
                <div className="mt-1 font-mono">
                  Coins vs buying weekly: <b style={{ color: col(r.coinsVsDca) }}>{pct(r.coinsVsDca)}</b> · 1st half <span style={{ color: col(r.h1) }}>{pct(r.h1)}</span> · 2nd half <span style={{ color: col(r.h2) }}>{pct(r.h2)}</span> · idle cash {r.idlePct.toFixed(0)}%
                </div>
                <button onClick={() => { setSetup(r.setup); setCoin("ALL"); }} className="mt-1 text-[11px] font-bold text-teal-300 underline">Load this into the sliders</button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((i) => (
              <button key={i.label} onClick={() => setSetup(i.make())} className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-300" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>{i.label}</button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              {setup.tiers.map((t, i) => (
                <div key={i} className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", opacity: t.on ? 1 : 0.6 }}>
                  <button onClick={() => setTier(i, { on: !t.on })} className="text-[11px] font-bold mb-1" style={{ color: t.on ? "#4ade80" : "#64748b" }}>{t.on ? "●" : "○"} Tier {i + 1} {t.on ? "on" : "off"}</button>
                  <Slider label="Buy when it drops" value={t.dip} min={1} max={30} step={0.5} unit="%" onChange={(v) => setTier(i, { dip: v })} disabled={!t.on} />
                  <Slider label="Sell when it's up" value={t.sell} min={3} max={100} step={0.5} unit="%" onChange={(v) => setTier(i, { sell: v })} disabled={!t.on || setup.sell === "never"} />
                  <Slider label="Spend of your cash" value={t.spend} min={1} max={40} step={1} unit="%" onChange={(v) => setTier(i, { spend: v })} disabled={!t.on} />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <div className="rounded-lg p-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-[11px] font-bold text-slate-300 mb-1">When it reaches the sell level</div>
                <div className="flex gap-1.5 mb-1">
                  {([["fixed", "Sell at once"], ["trail", "Trailing"], ["never", "Never sell"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setSetup((s) => ({ ...s, sell: k }))} className="flex-1 py-1 rounded text-[11px] font-bold"
                      style={{ background: setup.sell === k ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: setup.sell === k ? "#93c5fd" : "#94a3b8" }}>{l}</button>
                  ))}
                </div>
                <Slider label="Trailing: sell after a fall of" value={setup.trail} min={2} max={20} step={1} unit="%" onChange={(v) => setSetup((s) => ({ ...s, trail: v }))} disabled={setup.sell !== "trail"} />
              </div>
              <div className="rounded-lg p-2 space-y-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <Slider label="Top-up added per coin, per week" value={setup.weekly} min={0} max={100} step={5} unit="$" onChange={(v) => setSetup((s) => ({ ...s, weekly: v }))} />
                <Slider label="Starting cash per coin" value={setup.start} min={0} max={5000} step={100} unit="$" onChange={(v) => setSetup((s) => ({ ...s, start: v }))} />
                <Slider label="Buy straight away (share of each top-up)" value={setup.base} min={0} max={100} step={5} unit="%" onChange={(v) => setSetup((s) => ({ ...s, base: v }))} />
                <Slider label="Fee per trade" value={setup.fee} min={0} max={1.5} step={0.1} unit="%" onChange={(v) => setSetup((s) => ({ ...s, fee: v }))} />
              </div>
              <label className="block text-[11px] text-slate-400">Test on
                <select value={coin} onChange={(e) => setCoin(e.target.value)} className="ml-2 rounded bg-slate-800 text-slate-100 text-[12px] px-2 py-1">
                  <option value="ALL">All {coinList.length || ""} coins (average)</option>
                  {coinList.map((c) => <option key={c} value={c}>{c} only (see the chart)</option>)}
                </select>
              </label>
            </div>
          </div>

          {failed && <div className="text-xs text-red-400">Couldn't run the lab. Change a slider to retry.</div>}
          {data?.error && <div className="text-xs text-amber-400">{data.error}</div>}
          <div className="text-[11px] text-slate-500">{busy ? "Running your setup…" : "Updates automatically when you move a slider."}</div>

          {headline && !data?.error && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Card title="Coins vs buying weekly" value={pct(headline.coinsVsDca)} color={col(headline.coinsVsDca)} sub={headline.coinsVsDca >= 0 ? "more coins than just buying every week" : "fewer coins than just buying every week"} />
                <Card title="Cost per coin" value={pct(headline.costVsDca)} color={col(-headline.costVsDca)} sub="vs buying every week (lower is better)" />
                <Card title="Cash sitting idle" value={`${headline.idlePct.toFixed(0)}%`} sub="of the account, on average" />
                <Card title="Trades" value={`${headline.avgTrades}`} sub={data?.all ? `per coin · ${data.all.beatDca}/${data.all.coinsTested} coins beat weekly buying` : "in the year"} />
              </div>
              {data?.all && !Number.isNaN(data.all.h1) && (
                <div className="text-[11px] text-slate-400">First half of the year: <b style={{ color: col(data.all.h1) }}>{pct(data.all.h1)}</b> · second half: <b style={{ color: col(data.all.h2) }}>{pct(data.all.h2)}</b>. A setup worth trying wins in both.</div>
              )}
            </>
          )}

          {data?.single && !data.error && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-300">{data.single.coin} over the year — <span style={{ color: "#22c55e" }}>● buys</span> <span style={{ color: "#ef4444" }}>● sells</span> <span style={{ color: "#f59e0b" }}>- - average cost</span></div>
              <PriceChart s={data.single} />
              <div className="text-[11px] font-bold text-slate-300">Account value — <span style={{ color: "#2dd4bf" }}>your setup</span> vs <span style={{ color: "#94a3b8" }}>buying every week</span></div>
              <ValueChart s={data.single} />
            </div>
          )}

          {bars.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-slate-300 mb-1">All coins: ideas side by side (longer green bar = more coins than buying weekly)</div>
              {bars.map((b) => (
                <div key={b.label} className="flex items-center gap-2 text-[11px] mb-0.5" style={{ color: b.you ? "#facc15" : "#cbd5e1" }}>
                  <div className="w-[42%] truncate">{b.label}</div>
                  <div className="flex-1 h-3 rounded relative" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <div className="absolute top-0 bottom-0 left-1/2" style={{ width: 1, background: "rgba(255,255,255,0.2)" }} />
                    <div className="absolute top-0 bottom-0 rounded" style={{
                      background: b.v >= 0 ? "#22c55e" : "#ef4444", opacity: b.you ? 1 : 0.7,
                      left: b.v >= 0 ? "50%" : `${50 - (Math.abs(b.v) / bmax) * 50}%`, width: `${(Math.abs(b.v) / bmax) * 50}%`,
                    }} />
                  </div>
                  <div className="w-12 text-right font-mono">{pct(b.v)}</div>
                </div>
              ))}
              {data?.verdict && <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">{data.verdict}</div>}
            </div>
          )}

          <div className="text-[10px] text-slate-500 leading-relaxed">
            Daily prices miss intraday moves, and one year (mostly falling) is one market — so use this to find ideas worth a paper trial, not as a forecast. Nothing here changes the live bot. Not financial advice.
          </div>
        </div>
      )}
    </div>
  );
};

export default AccumLab;
