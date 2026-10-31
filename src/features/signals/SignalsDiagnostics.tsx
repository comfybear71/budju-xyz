import { useEffect, useState } from "react";
import { useWallet } from "@hooks/useWallet";
import { registerWallet } from "@features/trade/services/tradeApi";

type Json = Record<string, any>;

async function adminGet(path: string, wallet: string): Promise<Json> {
  try {
    const res = await fetch(`${path}?wallet=${wallet}&admin_wallet=${wallet}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? data : { error: data?.error || `HTTP ${res.status}` };
  } catch (e) {
    return { error: String(e) };
  }
}

/** Admin-only: find out why Helius isn't delivering, and re-register the webhook. */
const SignalsDiagnostics = () => {
  const { connection } = useWallet();
  const wallet = connection.wallet?.address || "";
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState("");
  const [lines, setLines] = useState<string[]>([]);
  const [raw, setRaw] = useState<Json | null>(null);

  useEffect(() => {
    setIsAdmin(false);
    if (!wallet) return;
    void registerWallet(wallet).then((d) => setIsAdmin(d?.role === "admin"));
  }, [wallet]);

  if (!isAdmin) return null;

  const selftest = async () => {
    setBusy("test");
    const r = await adminGet("/api/admin/copytrade-selftest", wallet);
    setRaw(r);
    setLines([
      r.ok
        ? "✅ Our address answers correctly (secret matches). The problem is on Helius's side."
        : r.status && r.status >= 300 && r.status < 400
          ? `⛔ Our address redirects to ${r.location || "somewhere else"} — Helius won't follow that.`
          : r.status === 401
            ? "⛔ Our address rejected the secret."
            : `⛔ Our address did not answer properly (${r.status ?? r.error}).`,
    ]);
    setBusy("");
  };

  const helius = async () => {
    setBusy("helius");
    const r = await adminGet("/api/admin/copytrade-debug", wallet);
    setRaw(r);
    if (r.error) {
      setLines([`⛔ ${r.error}`]);
    } else {
      const mine = (r.heliusWebhooksLive?.webhooks || []).filter((w: Json) => w.webhookURL === r.env?.webhookUrl);
      const d = r.ownWebhookDetail || {};
      const p = r.webhookPings || {};
      setLines([
        `Webhooks at Helius: ${r.heliusWebhooksLive?.webhooks?.length ?? "?"}${r.heliusWebhooksLive?.ok === false ? ` (${r.heliusWebhooksLive.error})` : ""}`,
        `Ours points to: ${d.webhookURL || mine[0]?.webhookURL || "not found"}`,
        `Active at Helius: ${String(d.active ?? mine[0]?.active ?? "unknown")}`,
        `Addresses watched: ${d.accountAddressCount ?? "?"} (we follow ${r.walletStatusCounts ? Object.values(r.walletStatusCounts as Json).reduce((a: number, b: any) => a + Number(b), 0) : "?"})`,
        `Secret set on our side: ${String(r.env?.hasWebhookSecret)} · sent by Helius: ${String(mine[0]?.hasAuthHeader ?? "unknown")}`,
        `Calls received — ok: ${p.countAuthOk ?? 0}, rejected: ${p.countAuthFail ?? 0}, last: ${p.lastPingAt || "never"}`,
      ]);
    }
    setBusy("");
  };

  const resync = async () => {
    setBusy("resync");
    const r = await adminGet("/api/admin/copytrade-resync", wallet);
    setRaw(r);
    setLines([r.ok ? `✅ Re-registered with Helius (${r.addressCount} wallets).` : `⛔ ${r.error || "Failed"}`]);
    setBusy("");
  };

  const copy = () => {
    try {
      void navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
      setLines((l) => [...l, "📋 Details copied — paste them to Claude."]);
    } catch {
      /* ignore */
    }
  };

  const btn = "px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-white/10 text-slate-200 disabled:opacity-40";
  return (
    <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.15)" }}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-2">🛠 Admin — fix delivery</div>
      <div className="flex flex-wrap gap-2 mb-2">
        <button className={btn} disabled={!!busy} onClick={selftest}>{busy === "test" ? "Testing…" : "1. Test our address"}</button>
        <button className={btn} disabled={!!busy} onClick={helius}>{busy === "helius" ? "Checking…" : "2. Check Helius"}</button>
        <button className={btn} disabled={!!busy} onClick={resync}>{busy === "resync" ? "Working…" : "3. Re-register now"}</button>
        {raw && <button className={btn} onClick={copy}>Copy details</button>}
      </div>
      {lines.map((l, i) => (
        <div key={i} className="text-[11px] text-slate-300 leading-relaxed">{l}</div>
      ))}
    </div>
  );
};

export default SignalsDiagnostics;
