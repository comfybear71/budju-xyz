import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchScout, manageCoin, ASSET_CONFIG, loadCoinConfig, type Scout } from "../services/tradeApi";

const Notes = ({ title, color, items }: { title: string; color: string; items: { coin: string; why: string }[] }) =>
  items.length === 0 ? null : (
    <div className="mb-2">
      <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color }}>{title}</div>
      {items.map((n) => (
        <div key={n.coin} className="text-[11px] text-slate-300"><b>{n.coin}</b> — <span className="text-slate-400">{n.why}</span></div>
      ))}
    </div>
  );

const CoinScout = ({ wallet, onChanged }: { wallet: string; onChanged: () => void }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Scout | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [msg, setMsg] = useState("");

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

  const add = async (code: string, id: string, name: string) => {
    const r = await manageCoin(wallet, "add", code, id, name);
    setMsg(r.ok ? `${code} added — put it in a tier from the + button below` : r.error || "Failed");
    if (r.ok) {
      await loadCoinConfig();
      onChanged();
    }
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
          {failed && <div className="text-xs text-red-400">Couldn't load the scout. Tap Refresh to try again.</div>}
          {data?.error && <div className="text-xs text-amber-400 mb-2">{data.error}</div>}
          {data && (
            <>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Your current coins</div>
              <Notes title="Consider removing" color="#ef4444" items={data.review.considerRemoving} />
              <Notes title="Working well — accumulate" color="#22c55e" items={data.review.keepStrong} />
              <Notes title="Quiet" color="#94a3b8" items={data.review.quiet} />

              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mt-3 mb-1">New opportunities</div>
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
                        onClick={() => add(c.code, c.id, c.name)}
                        disabled={!!ASSET_CONFIG[c.code]}
                        className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/20 text-green-400 disabled:opacity-40 flex-shrink-0"
                      >
                        {ASSET_CONFIG[c.code] ? "Added" : "Add"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
                Tests big, liquid coins ({data.swyftxChecked ? "listed on Swyftx" : "Swyftx list could not be checked — confirm it's listed before adding"}) with the same
                tier rules as the Dip Report. A good past year is not a promise. Nothing is added unless you tap Add.
              </div>
              {msg && <div className="text-xs text-slate-300 mt-1">{msg}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CoinScout;
