// The five views of the coin cards under "Monitoring N coins". Every card falls in exactly ONE of the first four, so the counts add up to All.
//   Cooldown     the tier is paused after a buy (the "cd 11h" timer)
//   Buy imminent the price is at or below its buy price (waiting for cash or its turn)
//   Discounted   below its open price (the purple badge), but not yet at the buy price: a dip in progress
//   Others       everything else (at or above its open price)

export type MonitorFilter = "all" | "cooldown" | "imminent" | "discounted" | "others";
export type MonitorCategory = Exclude<MonitorFilter, "all">;

export const FILTERS: { id: MonitorFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "cooldown", label: "Cooldown" },
  { id: "imminent", label: "Buy imminent" },
  { id: "discounted", label: "Discounted" },
  { id: "others", label: "Others" },
];

interface Item {
  inCooldown?: boolean;
  currentPrice?: number;
  buyTrigger?: number;
  deviation?: number;
  hasTarget?: boolean;
  hasLiveTarget?: boolean;
}

export function categorize(item: Item): MonitorCategory {
  if (item.inCooldown) return "cooldown";
  const price = Number(item.currentPrice) || 0;
  const buy = Number(item.buyTrigger) || 0;
  const hasTarget = item.hasTarget ?? item.hasLiveTarget ?? true;
  if (!hasTarget || price <= 0 || buy <= 0) return "others";
  if (price <= buy) return "imminent";
  const dev = Number(item.deviation) || 0;
  const open = dev > 0 && dev < 100 ? buy / (1 - dev / 100) : 0;          // the price when the targets were set
  if (open > 0 && price < open) return "discounted";
  return "others";
}

export function matches(item: Item, filter: MonitorFilter): boolean {
  return filter === "all" || categorize(item) === filter;
}

export function countByFilter(items: Item[]): Record<MonitorFilter, number> {
  const out: Record<MonitorFilter, number> = { all: items.length, cooldown: 0, imminent: 0, discounted: 0, others: 0 };
  for (const it of items) out[categorize(it)] += 1;
  return out;
}
