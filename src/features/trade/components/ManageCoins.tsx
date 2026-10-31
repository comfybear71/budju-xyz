import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";
import { ASSET_CONFIG, PERMANENT_BUY_DENYLIST, isRetiredCoin, manageCoin, searchCoins, type CoinSearchResult } from "../services/tradeApi";

interface Props {
  wallet: string;
  assignments: Record<string, number[]>;
  onChanged: () => void;
}

const ManageCoins = ({ wallet, assignments, onChanged }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CoinSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const doSearch = async () => {
    setBusy(true);
    setMsg("");
    const r = await searchCoins(wallet, q);
    setResults(r);
    if (r.length === 0) setMsg("Nothing found.");
    setBusy(false);
  };

  const act = async (action: "add" | "retire" | "restore", code: string, cgId = "", name = "") => {
    setBusy(true);
    const r = await manageCoin(wallet, action, code, cgId, name);
    setMsg(r.ok ? (action === "add" ? `${code} added — now add it to a tier below` : action === "retire" ? `${code} hidden from the add list` : `${code} back in the add list`) : r.error || "Failed");
    if (r.ok) {
      setResults([]);
      onChanged();
    }
    setBusy(false);
  };

  const all = Object.keys(ASSET_CONFIG).filter((c) => !["USDC", "AUD", "USD"].includes(c) && !PERMANENT_BUY_DENYLIST.has(c)).sort();
  const retired = all.filter(isRetiredCoin);
  const live = all.filter((c) => !isRetiredCoin(c));

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🪙 Manage coins — add or retire</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Add a coin</div>
            <div className="flex gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                placeholder="Name or symbol, e.g. Aave"
                className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs bg-white/5 border border-white/10 text-slate-200 outline-none"
              />
              <button onClick={doSearch} disabled={busy || q.trim().length < 2} className="px-3 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40">
                Search
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-2 space-y-1">
                {results.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                    <div className="min-w-0 text-xs text-slate-300 truncate">
                      <b>{r.code}</b> · {r.name} {r.rank ? <span className="text-slate-500">#{r.rank}</span> : null}
                    </div>
                    <button onClick={() => act("add", r.code, r.id, r.name)} disabled={busy || !!ASSET_CONFIG[r.code]} className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/20 text-green-400 disabled:opacity-40">
                      {ASSET_CONFIG[r.code] ? "Have it" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Pick the right one by its rank — many coins share a symbol. The coin must also be listed on Swyftx, or its orders will fail.
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Retire a coin (hides it from the add list)</div>
            <div className="flex flex-wrap gap-1">
              {live.map((c) => {
                const inUse = (assignments[c] || []).length > 0;
                return (
                  <button
                    key={c}
                    disabled={busy || inUse}
                    onClick={() => act("retire", c)}
                    title={inUse ? "Remove it from its tiers first" : "Retire"}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-400 disabled:opacity-30"
                  >
                    {c}{inUse ? " ●" : " ×"}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">● = still in a tier — take it out of its tiers first, then retire.</div>
          </div>

          {retired.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Retired</div>
              <div className="flex flex-wrap gap-1">
                {retired.map((c) => (
                  <button key={c} disabled={busy} onClick={() => act("restore", c)} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500">
                    {c} ↩
                  </button>
                ))}
              </div>
            </div>
          )}

          {msg && <div className="text-xs text-slate-300">{msg}</div>}
        </div>
      )}
    </div>
  );
};

export default ManageCoins;
