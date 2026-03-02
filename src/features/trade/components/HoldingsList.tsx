import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import {
  FaSortAmountDown,
  FaArrowUp,
  FaArrowDown,
} from "react-icons/fa";
import { ASSET_CONFIG } from "../services/tradeApi";
import type { PortfolioAsset } from "../services/tradeApi";

type SortKey = "value" | "change" | "name" | "balance";

interface HoldingsListProps {
  assets: PortfolioAsset[];
  prices: Record<string, number>;
  onSelectAsset: (code: string) => void;
  selectedAsset: string;
  isAdmin: boolean;
  userAllocation: number;
  viewMode: "mine" | "pool";
  onToggleView?: (mode: "mine" | "pool") => void;
}

// ── Tier categorization ─────────────────────────────────
type HoldingsTier = "top10" | "innovation" | "wildcards";

interface TierConfig {
  id: HoldingsTier;
  label: string;
  description: string;
  accent: string;
  accentHex: string;
}

const TIER_CONFIGS: TierConfig[] = [
  {
    id: "top10",
    label: "Top 10",
    description: "Major coins by market cap",
    accent: "from-blue-400 to-cyan-400",
    accentHex: "#60a5fa",
  },
  {
    id: "innovation",
    label: "Innovation",
    description: "AI, compute & next-gen projects",
    accent: "from-purple-400 to-pink-400",
    accentHex: "#c084fc",
  },
  {
    id: "wildcards",
    label: "Wildcards",
    description: "Alts, commodities & high conviction",
    accent: "from-amber-400 to-orange-400",
    accentHex: "#fbbf24",
  },
];

// Top 10 by market cap
const TOP_10_COINS = new Set([
  "BTC", "ETH", "XRP", "BNB", "SOL", "DOGE", "ADA", "TRX", "LINK", "AVAX",
]);

// AI, compute, next-gen L1s
const INNOVATION_COINS = new Set([
  "SUI", "NEAR", "RENDER", "FET", "TAO", "HYPE", "DOT",
]);

function getTier(code: string): HoldingsTier {
  if (TOP_10_COINS.has(code)) return "top10";
  if (INNOVATION_COINS.has(code)) return "innovation";
  return "wildcards";
}

/* ── Animated number that "spins up" when value changes ── */
const SpinNumber = ({
  value,
  formatter,
  className,
  flashColor,
}: {
  value: number;
  formatter: (n: number) => string;
  className?: string;
  flashColor?: "green" | "red" | null;
}) => {
  const [display, setDisplay] = useState(value);
  const [flashing, setFlashing] = useState(false);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;

    if (prev === value) return;

    // Flash color on change
    setFlashing(true);
    const flashTimer = setTimeout(() => setFlashing(false), 800);

    // Animate count-up over 600ms
    const start = prev;
    const end = value;
    const duration = 600;
    const t0 = performance.now();

    const tick = (now: number) => {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      clearTimeout(flashTimer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  const flashClass = flashing
    ? flashColor === "green"
      ? "text-green-400"
      : flashColor === "red"
        ? "text-red-400"
        : ""
    : "";

  return (
    <span className={`${className || ""} ${flashClass} transition-colors duration-500`}>
      {formatter(display)}
    </span>
  );
};

/* ── Countdown clock — resets each time prices refresh ── */
const REFRESH_SECONDS = 90;

const RefreshClock = ({ prices }: { prices: Record<string, number> }) => {
  const [remaining, setRemaining] = useState(REFRESH_SECONDS);
  const startRef = useRef(Date.now());

  // Reset countdown whenever prices change
  useEffect(() => {
    startRef.current = Date.now();
    setRemaining(REFRESH_SECONDS);
  }, [prices]);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = (Date.now() - startRef.current) / 1000;
      const left = Math.max(0, REFRESH_SECONDS - Math.floor(elapsed));
      setRemaining(left);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const progress = remaining / REFRESH_SECONDS; // 1 → 0
  const r = 7;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress);

  return (
    <div className="flex items-center gap-1 ml-2 opacity-60" title={`Refreshing in ${remaining}s`}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="flex-shrink-0">
        {/* Background ring */}
        <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1.5" />
        {/* Countdown ring */}
        <circle
          cx="9" cy="9" r={r}
          fill="none"
          stroke={remaining <= 5 ? "#3b82f6" : "rgba(148,163,184,0.4)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 9 9)"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
        />
        {/* Clock hands — minute hand rotates once per cycle */}
        <line
          x1="9" y1="9" x2="9" y2="4.5"
          stroke={remaining <= 5 ? "#3b82f6" : "rgba(148,163,184,0.5)"}
          strokeWidth="1"
          strokeLinecap="round"
          transform={`rotate(${(1 - progress) * 360} 9 9)`}
          style={{ transition: "transform 1s linear, stroke 0.3s ease" }}
        />
        {/* Centre dot */}
        <circle cx="9" cy="9" r="1" fill={remaining <= 5 ? "#3b82f6" : "rgba(148,163,184,0.4)"} style={{ transition: "fill 0.3s ease" }} />
      </svg>
      <span
        className="text-[9px] font-mono font-bold tabular-nums"
        style={{ color: remaining <= 5 ? "#3b82f6" : "rgba(148,163,184,0.5)", transition: "color 0.3s ease", minWidth: "14px" }}
      >
        {remaining}s
      </span>
    </div>
  );
};

/* ── Tier Tab Bar ─────────────────────────────────────── */
const TierTabs = ({
  tiers,
  activeIndex,
  onSelect,
  countByTier,
}: {
  tiers: TierConfig[];
  activeIndex: number;
  onSelect: (i: number) => void;
  countByTier: Record<HoldingsTier, number>;
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!tabsRef.current) return;
    const buttons = tabsRef.current.querySelectorAll<HTMLButtonElement>("[data-tier-tab]");
    const btn = buttons[activeIndex];
    if (btn) {
      setIndicatorStyle({
        left: btn.offsetLeft,
        width: btn.offsetWidth,
      });
    }
  }, [activeIndex]);

  return (
    <div
      ref={tabsRef}
      className="relative inline-flex rounded-xl p-1 bg-white/[0.04] border border-white/[0.06]"
    >
      {/* Sliding indicator */}
      <motion.div
        className="absolute top-1 bottom-1 rounded-lg bg-white/[0.08]"
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      />

      {tiers.map((tier, i) => {
        const count = countByTier[tier.id] || 0;
        const isActive = i === activeIndex;
        return (
          <button
            key={tier.id}
            data-tier-tab
            onClick={() => onSelect(i)}
            className={`relative z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-colors duration-200 whitespace-nowrap ${
              isActive
                ? "text-white"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${tier.accent} transition-opacity duration-200 ${
                isActive ? "opacity-100" : "opacity-40"
              }`}
            />
            {tier.label}
            {count > 0 && (
              <span
                className={`text-[9px] font-mono px-1 py-0.5 rounded-md transition-colors duration-200 ${
                  isActive
                    ? "bg-white/10 text-white/80"
                    : "bg-white/[0.04] text-gray-600"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ── Dot Indicators (mobile) ─────────────────────────── */
const DotIndicators = ({
  count,
  activeIndex,
  tiers,
}: {
  count: number;
  activeIndex: number;
  tiers: TierConfig[];
}) => (
  <div className="flex justify-center gap-2 mt-3">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div
        key={i}
        className={`h-1.5 rounded-full bg-gradient-to-r ${tiers[i].accent}`}
        animate={{
          width: i === activeIndex ? 20 : 6,
          opacity: i === activeIndex ? 1 : 0.3,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      />
    ))}
  </div>
);

const HoldingsList = ({
  assets,
  prices,
  onSelectAsset,
  selectedAsset,
  isAdmin,
  userAllocation,
  viewMode,
}: HoldingsListProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortAsc, setSortAsc] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeTierIndex, setActiveTierIndex] = useState(0);
  const dragX = useMotionValue(0);

  // Track previous prices to determine up/down direction
  const prevPricesRef = useRef<Record<string, number>>({});
  const [priceDirection, setPriceDirection] = useState<Record<string, "up" | "down" | null>>({});

  useEffect(() => {
    const prev = prevPricesRef.current;
    const dirs: Record<string, "up" | "down" | null> = {};

    for (const a of assets) {
      const oldPrice = prev[a.code];
      const newPrice = prices[a.code] || a.priceUsd;
      if (oldPrice !== undefined && oldPrice !== newPrice) {
        dirs[a.code] = newPrice > oldPrice ? "up" : newPrice < oldPrice ? "down" : null;
      } else {
        dirs[a.code] = null;
      }
    }

    setPriceDirection(dirs);
    // Store current prices as previous for next comparison
    const snapshot: Record<string, number> = {};
    for (const a of assets) {
      snapshot[a.code] = prices[a.code] || a.priceUsd;
    }
    prevPricesRef.current = snapshot;

    // Clear direction indicators after 3 seconds
    const timer = setTimeout(() => {
      setPriceDirection({});
    }, 3000);
    return () => clearTimeout(timer);
  }, [prices, assets]);

  const totalValue = assets.reduce((s, a) => s + a.usdValue, 0);

  // Group assets by tier
  const assetsByTier = useMemo(() => {
    const grouped: Record<HoldingsTier, PortfolioAsset[]> = {
      top10: [],
      innovation: [],
      wildcards: [],
    };
    for (const a of assets) {
      grouped[getTier(a.code)].push(a);
    }
    return grouped;
  }, [assets]);

  // Count per tier
  const countByTier: Record<HoldingsTier, number> = {
    top10: assetsByTier.top10.length,
    innovation: assetsByTier.innovation.length,
    wildcards: assetsByTier.wildcards.length,
  };

  // Only show tiers that have holdings
  const activeTiers = TIER_CONFIGS.filter((t) => assetsByTier[t.id].length > 0);
  const tiers = activeTiers.length > 0 ? activeTiers : TIER_CONFIGS;
  const currentTier = tiers[activeTierIndex] || tiers[0];
  const currentAssets = assetsByTier[currentTier.id] || [];

  // Tier subtotal
  const tierValue = currentAssets.reduce((s, a) => s + a.usdValue, 0);

  // Sort current tier's assets
  const sorted = useMemo(() => {
    const arr = [...currentAssets];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "value":
          cmp = a.usdValue - b.usdValue;
          break;
        case "change":
          cmp = a.change24h - b.change24h;
          break;
        case "name":
          cmp = a.code.localeCompare(b.code);
          break;
        case "balance":
          cmp = a.balance - b.balance;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [currentAssets, sortKey, sortAsc]);

  const goToTier = useCallback(
    (index: number) => {
      setActiveTierIndex(Math.max(0, Math.min(index, tiers.length - 1)));
    },
    [tiers.length],
  );

  // Swipe handling
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const swipeThreshold = 50;
      const velocityThreshold = 300;

      if (
        info.offset.x < -swipeThreshold ||
        info.velocity.x < -velocityThreshold
      ) {
        goToTier(activeTierIndex + 1);
      } else if (
        info.offset.x > swipeThreshold ||
        info.velocity.x > velocityThreshold
      ) {
        goToTier(activeTierIndex - 1);
      }
    },
    [activeTierIndex, goToTier],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
    setShowSortMenu(false);
  };

  const formatBalance = (n: number) => {
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.001) return n.toFixed(4);
    return n.toFixed(8);
  };

  const formatUsd = (n: number) => {
    const display = viewMode === "mine" && !isAdmin ? n * (userAllocation / 100) : n;
    if (display >= 1000) return `$${display.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (display >= 1) return `$${display.toFixed(2)}`;
    return `$${display.toFixed(4)}`;
  };

  if (assets.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-slate-500">No holdings data available</p>
        <p className="text-xs text-slate-600 mt-1">
          Check your PIN and try refreshing
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header with tier tabs */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <h3 className="text-sm font-bold text-slate-300">
            Holdings
            <span className="text-slate-600 font-normal ml-1.5">
              ({assets.length})
            </span>
          </h3>
          <RefreshClock prices={prices} />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            <FaSortAmountDown size={10} />
            {sortKey.charAt(0).toUpperCase() + sortKey.slice(1)}
          </button>

          {/* Sort dropdown */}
          <AnimatePresence>
            {showSortMenu && (
              <motion.div
                initial={{ opacity: 0, y: -5, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -5, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-slate-800 border border-slate-700/50 shadow-xl overflow-hidden z-20"
              >
                {(
                  [
                    ["value", "Value"],
                    ["change", "Change %"],
                    ["name", "Name"],
                    ["balance", "Balance"],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${
                      sortKey === key
                        ? "bg-blue-500/10 text-blue-400"
                        : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
                    }`}
                  >
                    {label}
                    {sortKey === key && (
                      <span className="ml-1 opacity-50">
                        {sortAsc ? "\u2191" : "\u2193"}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tier subtotal + Portfolio total */}
      <motion.div
        key={currentTier.id + "-value"}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex justify-between items-end mb-4"
      >
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-600 mb-0.5">
            {currentTier.label} Value
          </p>
          <span
            className={`text-xl font-black font-mono bg-gradient-to-r ${currentTier.accent} bg-clip-text text-transparent`}
          >
            {formatUsd(tierValue)}
          </span>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-gray-600 mb-0.5">
            Total
          </p>
          <span className="text-xl font-black font-mono text-white/80">
            {formatUsd(totalValue)}
          </span>
        </div>
      </motion.div>

      {/* Tier Tabs */}
      {tiers.length > 1 && (
        <div className="flex justify-center mb-4">
          <TierTabs
            tiers={tiers}
            activeIndex={activeTierIndex}
            onSelect={goToTier}
            countByTier={countByTier}
          />
        </div>
      )}

      {/* Swipeable Holdings Cards */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ x: dragX, touchAction: "pan-y" }}
        className="cursor-grab active:cursor-grabbing"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTier.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="space-y-2"
          >
            {sorted.map((asset, index) => {
              const cfg = ASSET_CONFIG[asset.code];
              const isSelected = selectedAsset === asset.code;
              const allocation =
                totalValue > 0 ? (asset.usdValue / totalValue) * 100 : 0;
              const changeColor =
                asset.change24h > 0
                  ? "text-green-400"
                  : asset.change24h < 0
                    ? "text-red-400"
                    : "text-slate-500";

              const dir = priceDirection[asset.code];
              const borderColor =
                dir === "up"
                  ? "border-green-500/60"
                  : dir === "down"
                    ? "border-red-500/60"
                    : isSelected
                      ? "border-blue-500/20"
                      : "border-transparent";

              const glowShadow =
                dir === "up"
                  ? "shadow-[0_0_12px_rgba(34,197,94,0.15)]"
                  : dir === "down"
                    ? "shadow-[0_0_12px_rgba(239,68,68,0.15)]"
                    : "";

              const flashColor =
                dir === "up" ? ("green" as const)
                  : dir === "down" ? ("red" as const)
                  : null;

              return (
                <motion.div
                  key={asset.code}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                  onClick={isAdmin ? () => onSelectAsset(asset.code) : undefined}
                  className={`relative rounded-xl p-3.5 transition-all duration-300 border ${borderColor} ${glowShadow} ${
                    isAdmin
                      ? isSelected
                        ? "bg-blue-500/[0.08] cursor-pointer"
                        : "bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-700/30 cursor-pointer"
                      : "bg-slate-800/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Coin icon */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        backgroundColor: `${cfg?.color || "#64748b"}15`,
                        color: cfg?.color || "#64748b",
                      }}
                    >
                      {cfg?.icon || asset.code.charAt(0)}
                    </div>

                    {/* Coin info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm font-bold text-white">
                            {asset.code}
                          </span>
                          <span className="text-[11px] text-slate-500 ml-1.5">
                            {asset.name}
                          </span>
                        </div>
                        <div className="text-right">
                          <SpinNumber
                            value={asset.usdValue}
                            formatter={formatUsd}
                            className="text-sm font-bold text-white font-mono"
                            flashColor={flashColor}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatBalance(
                            viewMode === "mine" && !isAdmin
                              ? asset.balance * (userAllocation / 100)
                              : asset.balance,
                          )}
                        </span>
                        <div className={`flex items-center gap-1 ${changeColor}`}>
                          {asset.change24h > 0 ? (
                            <FaArrowUp size={8} />
                          ) : asset.change24h < 0 ? (
                            <FaArrowDown size={8} />
                          ) : null}
                          <SpinNumber
                            value={asset.change24h}
                            formatter={(n) =>
                              `${n > 0 ? "+" : ""}${n.toFixed(1)}%`
                            }
                            className="text-[11px] font-bold font-mono"
                            flashColor={flashColor}
                          />
                        </div>
                      </div>

                      {/* Allocation bar */}
                      <div className="mt-2 h-1 rounded-full bg-slate-800/60 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(allocation, 100)}%` }}
                          transition={{ duration: 0.5, delay: index * 0.05 }}
                          className="h-full rounded-full"
                          style={{
                            backgroundColor: cfg?.color || "#64748b",
                            opacity: 0.6,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Empty tier state */}
            {sorted.length === 0 && (
              <div className="text-center py-10 rounded-xl border border-white/[0.04] bg-white/[0.02]">
                <p className="text-sm font-medium text-gray-600">No {currentTier.label} holdings</p>
                <p className="text-xs mt-1 text-gray-700">
                  Holdings in this category will appear here
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Dot indicators */}
      {tiers.length > 1 && (
        <DotIndicators
          count={tiers.length}
          activeIndex={activeTierIndex}
          tiers={tiers}
        />
      )}
    </div>
  );
};

export default HoldingsList;
