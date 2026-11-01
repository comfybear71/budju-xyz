import { useEffect, useState } from "react";
import { agreeTradingPermission, fetchTradingPermission } from "../services/tradeApi";

/** One-time agreement shown to a connected wallet until it has agreed. */
const TradingPermission = ({ wallet }: { wallet: string }) => {
  const [agreed, setAgreed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setAgreed(null);
    void fetchTradingPermission(wallet).then((p) => setAgreed(p ? p.agreed : null));
  }, [wallet]);

  if (agreed !== false) return null; // unknown or already agreed: show nothing

  const agree = async () => {
    setBusy(true);
    setErr("");
    const r = await agreeTradingPermission(wallet);
    if (r?.agreed) setAgreed(true);
    else setErr("Couldn't save that — please try again.");
    setBusy(false);
  };

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
      <div className="text-sm font-bold text-amber-300 mb-1">📝 Trading permission</div>
      <p className="text-[12px] text-slate-300 leading-relaxed">
        By joining BUDJU you let BUDJU buy and sell coins in your linked Swyftx account using your API key — including occasional rebalances that sell a share of
        weaker coins to buy stronger ones. BUDJU cannot withdraw your money. You remain responsible for your own account, your records and any tax (including
        capital gains tax). You can switch the bot off or remove your key at any time. Your trade history is available from Activity → Download.
      </p>
      {err && <div className="text-xs text-red-400 mt-2">{err}</div>}
      <button onClick={agree} disabled={busy} className="mt-3 px-4 py-2 rounded-lg text-xs font-bold bg-amber-500/25 text-amber-200 disabled:opacity-50">
        {busy ? "Saving…" : "I agree"}
      </button>
    </div>
  );
};

export default TradingPermission;
