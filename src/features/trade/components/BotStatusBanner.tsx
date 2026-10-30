import { useEffect, useState } from "react";

interface BotStatus {
  level: "ok" | "warn" | "error";
  messages: string[];
  lastRunAgo: string | null;
}

const POLL_MS = 60_000;

/**
 * Says plainly whether the auto-trade bot can trade right now, and if not,
 * why (TRADING_ENABLED off, master switch off, cron not running, ...).
 * Reads `botStatus` from /api/state, computed server-side (api/bot_status.py).
 */
const BotStatusBanner = () => {
  const [status, setStatus] = useState<BotStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.botStatus) setStatus(data.botStatus as BotStatus);
      } catch {
        // Banner is best-effort; never break the Auto Trade screen.
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  if (status.level === "ok") {
    return (
      <div className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 text-center">
        ✓ Bot running{status.lastRunAgo ? ` · last check ${status.lastRunAgo}` : ""}
      </div>
    );
  }

  const isError = status.level === "error";
  return (
    <div
      className={`text-[11px] font-bold rounded-lg px-3 py-2 space-y-1 border ${
        isError
          ? "text-red-400 bg-red-500/10 border-red-500/30"
          : "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
      }`}
    >
      <div className="uppercase tracking-wide text-[10px]">
        {isError ? "⛔ Bot is NOT trading" : "⚠ Bot needs a look"}
      </div>
      {status.messages.map((m) => (
        <div key={m} className="font-medium">
          {m}
        </div>
      ))}
      {status.lastRunAgo && <div className="text-[10px] opacity-70 font-medium">Last trading run: {status.lastRunAgo}</div>}
    </div>
  );
};

export default BotStatusBanner;
