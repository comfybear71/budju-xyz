/**
 * Tax-loss rebuy blocklist helpers (mirrors api/trade_guards.py).
 * Coins sold ~90% for tax purposes — bot must not rebuy until expiry.
 */

/** Seed default — used when Mongo has never stored autoRebuyBlocklist. */
export const DEFAULT_REBUY_BLOCKLIST: Record<string, string> = Object.fromEntries(
  [
    "LUNA", "ENA", "SUI", "ADA", "BCH", "DOT", "PEPE",
    "XRP", "NEO", "DOGE", "AVAX", "HBAR", "RENDER", "XAUT",
  ].map((coin) => [coin, "2026-08-30T00:00:00Z"]),
);

/** Resolve effective blocklist: DB value, or seed default when missing/null. */
export function resolveRebuyBlocklist(
  raw: Record<string, string> | null | undefined,
): Record<string, string> {
  if (raw == null) return { ...DEFAULT_REBUY_BLOCKLIST };
  return raw;
}

/** True if coin is still blocked from bot rebuys. */
export function isRebuyBlocked(
  blocklist: Record<string, string> | null | undefined,
  coin: string,
  now: Date = new Date(),
): boolean {
  if (!blocklist || !coin) return false;
  const untilRaw = blocklist[coin];
  if (!untilRaw) return false;
  const until = Date.parse(String(untilRaw).replace("Z", "+00:00"));
  if (Number.isNaN(until)) return false;
  return now.getTime() < until;
}

/** Short label for UI, e.g. "30 Aug". */
export function rebuyBlockedUntilLabel(
  blocklist: Record<string, string> | null | undefined,
  coin: string,
): string | null {
  if (!blocklist?.[coin]) return null;
  const d = new Date(String(blocklist[coin]).replace("Z", "+00:00"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
