import { useState } from "react";
import { FaChevronDown, FaChevronRight, FaSync } from "react-icons/fa";
import { fetchWalletCoinSuggestions, manageCoin, loadCoinConfig, type WalletCoinSuggestion } from "../services/tradeApi";
import type { AutoTrader } from "../services/autoTrader";

interface Props {
  wallet: string;
  autoTrader: AutoTrader;
  onChanged: () => void;
}

const WalletCoinSuggestions = ({ wallet, autoTrader, onChanged }: Props) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<WalletCoinSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    const r = await fetchWalletCoinSuggestions(wallet);
    setRows(r);
    setFailed(!r);
    setLoading(false);
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !rows && !loading) void load();
  };

  const add = async (s: WalletCoinSuggestion) => {
    setAdding(s.code);
    setMsg("");
    const r = await manageCoin(wallet, "add", s.code, s.cgId, s.name);
    if (!r.ok) {
      setMsg(`⛔ ${r.error || "Failed"}`);
      setAdding(null);
      return;
    }
    for (const t of [1, 2, 3]) autoTrader.assignCoin(s.code, t);
    setAdded((a) => [...a, s.code]);
    setMsg(`✅ ${s.code} added to T1 + T2 + T3 — every wallet will now trade it`);
    await loadCoinConfig();
    onChanged();
    setAdding(null);
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={toggle} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">👛 Suggested from wallets</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <button onClick={load} disabled={loading} className="text-[11px] text-slate-400 mb-2 flex items-center gap-1">
            <FaSync size={10} className={loading ? "animate-spin" : ""} /> {loading ? "Checking every wallet…" : "Refresh"}
          </button>
          {msg && <div className="text-xs text-slate-200 rounded-lg px-2 py-1.5 mb-2" style={{ background: "rgba(255,255,255,0.08)" }}>{msg}</div>}
          {failed && <div className="text-xs text-red-400">Couldn't load. Tap Refresh to try again.</div>}
          {rows && rows.length === 0 && (
            <div className="text-[11px] text-slate-500">Every coin your wallets hold is already being traded.</div>
          )}
          {rows && rows.length > 0 && (
            <div className="space-y-1">
              {rows.map((s) => (
                <div key={s.code} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 bg-white/[0.03]">
                  <div className="min-w-0 text-[11px] text-slate-300">
                    <b>{s.code}</b> · {s.name}
                    <div className="text-slate-500">
                      held by {s.wallets} wallet{s.wallets === 1 ? "" : "s"} · ${s.usdValue.toLocaleString()}
                      {s.small ? " · ⚠️ small coin" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => add(s)}
                    disabled={adding === s.code || added.includes(s.code)}
                    className="text-[11px] font-bold px-2 py-1 rounded bg-green-500/20 text-green-400 flex-shrink-0 min-w-[64px] disabled:opacity-60"
                  >
                    {added.includes(s.code) ? "Added ✓" : adding === s.code ? "Adding…" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="text-[10px] text-slate-500 mt-2 leading-relaxed">
            Coins a wallet holds that the bot doesn't trade yet (Swyftx coins only). Tap Add and the coin joins T1, T2 and T3 for all wallets — change that
            any time in Coin tiers. Dust under $20 is hidden.
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletCoinSuggestions;
