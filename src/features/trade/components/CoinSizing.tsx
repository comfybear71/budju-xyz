import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchSizing, saveSizing, type SizingPreview } from "../services/tradeApi";

const CLASS_INFO: Record<string, { icon: string; label: string }> = {
  blue: { icon: "🏛", label: "Blue chip" },
  large: { icon: "🏢", label: "Large" },
  mid: { icon: "🏬", label: "Mid" },
  small: { icon: "🎲", label: "Small" },
};
const STAGES = [100, 500, 1000, 2500];
const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const CoinSizing = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SizingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [custom, setCustom] = useState("");

  const load = async (refresh = false) => {
    setLoading(true);
    if (refresh) await saveSizing(wallet, { refresh: true });
    setData(await fetchSizing(wallet));
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) void load();
  };

  const change = async (c: { enabled?: boolean; capUsd?: number }, text: string) => {
    setMsg("");
    const ok = await saveSizing(wallet, c);
    setMsg(ok ? `✅ ${text}` : "⛔ Couldn't save — try again");
    if (ok) await load();
  };

  const cap = data?.settings.capUsd ?? 0;
  const on = !!data?.settings.enabled;

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">📏 Coin size &amp; position cap {data ? (on ? "· ON" : "· OFF") : ""}</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Bigger coins buy more per dip, smaller coins buy less (🏛 ×1.0 · 🏢 ×0.85 · 🏬 ×0.65 · 🎲 ×0.4). A coin the Dip Report calls
            "Careful" drops one class, and thinly traded coins buy a little less. Once a wallet holds the cap in dollars of a coin, the bot stops buying
            that coin. Raise the cap in stages. Applies to every wallet. <b>It is OFF until you switch it on.</b>
          </p>
          {loading && !data && <div className="text-xs text-slate-500">Loading…</div>}
          {data && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button
                  onClick={() => change({ enabled: !on }, on ? "Switched OFF — the bot buys the normal amounts" : "Switched ON — sizing and cap now apply")}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: on ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.08)", color: on ? "#4ade80" : "#cbd5e1" }}
                >
                  {on ? "ON — tap to switch off" : "OFF — tap to switch on"}
                </button>
                <button onClick={() => load(true)} disabled={loading} className="text-[11px] text-slate-400 flex items-center gap-1">
                  <FaSync size={10} className={loading ? "animate-spin" : ""} /> Refresh sizes
                </button>
              </div>

              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Cap per coin (per wallet)</div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => change({ capUsd: s }, `Cap set to ${usd(s)} per coin`)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold"
                    style={{ background: cap === s ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)", color: cap === s ? "#93c5fd" : "#94a3b8" }}
                  >
                    {usd(s)}
                  </button>
                ))}
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="other $"
                  inputMode="numeric"
                  className="w-20 rounded-lg px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-200 outline-none"
                />
                <button
                  disabled={!custom}
                  onClick={() => { void change({ capUsd: Number(custom) }, `Cap set to ${usd(Number(custom))} per coin`); setCustom(""); }}
                  className="px-2 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40"
                >
                  Set
                </button>
              </div>
              {msg && <div className="text-xs text-slate-200 rounded-lg px-2 py-1.5 mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>{msg}</div>}

              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Preview — admin wallet right now</div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="py-1 px-1">Coin</th>
                      <th className="px-1">Class</th>
                      <th className="px-1 text-right">Buy size</th>
                      <th className="px-1 text-right">Held</th>
                      <th className="px-1 text-right">Room to cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => {
                      const ci = CLASS_INFO[r.cls];
                      const full = cap > 0 && r.roomUsd !== null && r.roomUsd < 8;
                      return (
                        <tr key={r.coin} className="border-t border-white/[0.05]" style={{ height: 28 }}>
                          <td className="px-1 font-bold text-slate-200">{r.coin}</td>
                          <td className="px-1 text-slate-300">
                            {ci ? `${ci.icon} ${ci.label}` : "—"}{r.careful ? " ⚠️" : ""}{r.thin ? " 💧" : ""}
                          </td>
                          <td className="px-1 text-right font-mono text-slate-300">{r.mult ? `×${r.mult}` : "—"}</td>
                          <td className="px-1 text-right font-mono text-slate-400">{usd(r.heldUsd)}</td>
                          <td className="px-1 text-right font-mono" style={{ color: full ? "#f87171" : "#4ade80" }}>
                            {cap > 0 && r.roomUsd !== null ? (full ? "full" : usd(r.roomUsd)) : "no cap"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-slate-500 mt-2">⚠️ = Dip Report says careful (dropped one class) · 💧 = thin trading · "full" = no more buys until you raise the cap or it falls.</div>
            </>
          )}
          {!loading && !data && <div className="text-xs text-red-400">Couldn't load. Open and close to try again.</div>}
        </div>
      )}
    </div>
  );
};

export default CoinSizing;
