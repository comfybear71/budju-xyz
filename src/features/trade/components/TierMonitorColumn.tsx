import type { ReactNode } from "react";

interface Props {
  /** Short tier label, e.g. "T1" */
  tierLabel: string;
  /** Tier name, e.g. "Dip" */
  tierName: string;
  /** Tier accent colour */
  tierColor: string;
  /** Whether the tier is currently active */
  active: boolean;
  /** Number of coins in this tier column */
  coinCount: number;
  /** Buy deviation % (shown as -X%) */
  dev: number;
  /** Sell deviation % (shown as +X%) */
  sellDev: number;
  /** Allocation % */
  alloc: number;
  /** Coin cards for this tier */
  children: ReactNode;
}

/**
 * Shared monitoring-column shell for the auto-trader views.
 *
 * Renders the column chrome — wrapper, sticky header (tier name + active
 * badge + coin count), the Buy/Sell/Alloc settings summary row, and the
 * vertically-scrolling body — while each view supplies its own coin cards
 * as children. Used by both AutoTraderView (view-only) and
 * AdminAutoTradeView so the two stay visually identical.
 *
 * Layout responsibility (grid/scroll container) belongs to the parent; this
 * component is a single column meant to sit inside that grid.
 */
const TierMonitorColumn = ({
  tierLabel,
  tierName,
  tierColor,
  active,
  coinCount,
  dev,
  sellDev,
  alloc,
  children,
}: Props) => {
  return (
    <div
      className="flex-shrink-0 snap-start rounded-xl flex flex-col w-[min(330px,86vw)] md:w-auto md:min-w-0 md:flex-shrink"
      style={{
        background: `${tierColor}0d`,
        border: `1px solid ${tierColor}30`,
      }}
    >
      {/* Tier column header (sticky) */}
      <div
        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-xl sticky top-0 z-10"
        style={{ background: `${tierColor}1f`, borderBottom: `1px solid ${tierColor}30`, backdropFilter: "blur(6px)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-bold whitespace-nowrap" style={{ color: tierColor }}>
            {tierLabel} · {tierName}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg"
            style={{
              background: active ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)",
              color: active ? "#22c55e" : "#64748b",
            }}
          >
            {active ? "ACTIVE" : "OFF"}
          </span>
        </div>
        <span className="text-[9px] text-slate-500 whitespace-nowrap">
          {coinCount} coin{coinCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tier settings summary row */}
      <div className="flex gap-2 text-[9px] px-3 py-1.5" style={{ borderBottom: `1px solid ${tierColor}20` }}>
        <span className="text-slate-500">Buy <span className="font-bold text-green-400">-{dev}%</span></span>
        <span className="text-slate-500">Sell <span className="font-bold text-red-400">+{sellDev}%</span></span>
        <span className="text-slate-500">Alloc <span className="font-bold text-blue-400">{alloc}%</span></span>
      </div>

      {/* Coin cards (scroll vertically inside the column) */}
      <div className="space-y-1.5 p-2 overflow-y-auto" style={{ maxHeight: "58vh" }}>
        {children}
      </div>
    </div>
  );
};

export default TierMonitorColumn;
