// Text for the "trailing stops" banner at the top of the trade page (pure: no React, no network).
//   armed      a coin that reached its sell level; the trailing stop is watching it and sells if the price falls back from its high
//   triggered  a coin the bot sold because its trailing stop fired, in the last 24 hours

export interface TrailState { high: number; at?: number }
export interface TrailPlan { arm?: number; trail: number; slice?: number }
export interface LogEntry { coin: string; side: string; price: number; timestamp: string; why?: string }

const price = (n: number) => {
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  // 3 significant digits for small prices, without a trailing zero: 0.00092, 0.361
  const lead = n.toFixed(10).match(/^0\.(0*)/)?.[1].length ?? 0;
  return `$${Number(n.toFixed(lead + 3))}`;
};

function ago(ms: number): string {
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(ms / 60_000))}m ago` : `${Math.round(h)}h ago`;
}

export function buildTrailingItems(
  trail: Record<string, TrailState> | undefined,
  plan: Record<string, TrailPlan> | undefined,
  tradeLog: LogEntry[] | undefined,
  now: number,
  limits = { armed: 8, triggered: 5 },
): { armed: string[]; triggered: string[] } {
  const armed: string[] = [];
  for (const [ck, st] of Object.entries(trail || {})) {
    const [coin, tier] = ck.split(":");
    const high = Number(st?.high) || 0;
    const pull = Number(plan?.[tier]?.trail) || 5;
    if (!coin || high <= 0) continue;
    armed.push(`🛡️ ${coin} T${tier} stop armed: sells if it falls below ${price(high * (1 - pull / 100))}`);
  }
  const triggered: string[] = [];
  for (const e of tradeLog || []) {
    // the reason starts with "trailing stop:" only when the stop really fired ("...the trailing stop is switched off" must not count)
    if (e.side !== "sell" || !/^trailing stop:/i.test(e.why || "")) continue;
    const t = new Date(e.timestamp).getTime();
    if (!(now - t < 24 * 3_600_000)) continue;
    triggered.push(`✅ ${e.coin} sold on its trailing stop at ${price(e.price)} (${ago(now - t)})`);
  }
  return { armed: armed.slice(0, limits.armed), triggered: triggered.slice(0, limits.triggered) };
}

/** One line for the banner, or "" when there is nothing to show. */
export function trailingBannerText(items: { armed: string[]; triggered: string[] }): string {
  const all = [...items.triggered, ...items.armed];
  return all.length ? `TRAILING STOPS · ${all.join(" · ")}` : "";
}
