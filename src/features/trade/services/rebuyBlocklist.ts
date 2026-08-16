/**
 * Tax-loss rebuy blocklist helpers (mirrors api/trade_guards.py).
 *
 * July 2026 wash-sale blocks were lifted early on 2026-08-16.
 * Default seed is empty; legacy Aug-30 entries are treated as expired.
 */

/** Empty seed — matches Python DEFAULT_REBUY_BLOCKLIST after early lift. */
export const DEFAULT_REBUY_BLOCKLIST: Record<string, string> = {};

const EARLY_LIFT_MS = Date.parse("2026-08-16T00:00:00Z");
const LEGACY_EXPIRY_MS = Date.parse("2026-08-30T00:00:00Z");

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
  const nowMs = now.getTime();
  // Early lift of the original tax-loss window (mirrors Python)
  if (nowMs >= EARLY_LIFT_MS && until <= LEGACY_EXPIRY_MS) {
    return false;
  }
  return nowMs < until;
}

/** Short label for UI, e.g. "30 Aug". */
export function rebuyBlockedUntilLabel(
  blocklist: Record<string, string> | null | undefined,
  coin: string,
): string | null {
  if (!blocklist?.[coin]) return null;
  if (!isRebuyBlocked(blocklist, coin)) return null;
  const d = new Date(String(blocklist[coin]).replace("Z", "+00:00"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
