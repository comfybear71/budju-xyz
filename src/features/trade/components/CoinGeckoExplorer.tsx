import { useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa";

interface ProbeRow { name: string; path: string; ok: boolean; status: number | null; seconds: number; count?: number; fields?: string[]; message?: string }
interface Holder { address: string; label?: string | null; percent?: string | number | null; value?: string | number | null }
interface Probe { hasKey: boolean; results: ProbeRow[]; bigHolders: { token: string; holders: Holder[] }[] }

const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Admin: tests which CoinGecko on-chain endpoints our plan can use, and shows the biggest holders it can see. */
const CoinGeckoExplorer = ({ wallet }: { wallet: string }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/admin/coingecko-probe?wallet=${wallet}&admin_wallet=${wallet}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as Probe);
    } catch {
      setFailed(true);
    }
    setBusy(false);
  };

  const copy = () => {
    try {
      void navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2.5 text-left">
        <span className="text-sm font-bold text-slate-200">🦎 CoinGecko on-chain explorer</span>
        {open ? <FaChevronDown size={11} className="text-slate-500" /> : <FaChevronRight size={11} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
            Tests the on-chain endpoints with your key (about 8 calls) and shows which ones your plan allows, plus the biggest holders it can see for two Solana tokens.
          </p>
          <div className="flex gap-2 mb-2">
            <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/10 text-slate-200 disabled:opacity-40">
              {busy ? "Testing…" : "Run test"}
            </button>
            {data && <button onClick={copy} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-slate-400">Copy details</button>}
          </div>
          {failed && <div className="text-xs text-red-400">Couldn't run the test. Try again.</div>}
          {data && (
            <>
              {!data.hasKey && <div className="text-xs text-amber-400 mb-1">No CoinGecko key is set on the server.</div>}
              <div className="space-y-1">
                {data.results.map((r, i) => (
                  <div key={i} className="text-[11px] text-slate-300">
                    {r.ok ? "✅" : r.status === 401 || r.status === 403 ? "🔒" : "⛔"} <b>{r.name}</b> — {r.ok ? `${r.count} item(s) · ${r.seconds}s` : `HTTP ${r.status ?? "?"} ${r.message ?? ""}`}
                    {r.ok && r.fields && r.fields.length > 0 && <div className="text-[10px] text-slate-500 truncate">fields: {r.fields.join(", ")}</div>}
                  </div>
                ))}
              </div>
              {data.bigHolders.map((b) => (
                <div key={b.token} className="mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Biggest {b.token} holders</div>
                  {b.holders.map((h, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-slate-300">
                      <span>{short(h.address)}{h.label ? ` · ${h.label}` : ""}</span>
                      <span>{h.percent != null ? `${h.percent}%` : ""}{h.value != null ? ` · $${Number(h.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ""}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CoinGeckoExplorer;
