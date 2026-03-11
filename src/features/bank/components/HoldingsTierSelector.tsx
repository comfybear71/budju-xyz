import { useRef, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import { useTheme } from "@/context/ThemeContext";
import { TIER_CONFIGS, type HoldingTier, type TierConfig, type TokenHolding } from "../services/bankHoldings";

interface HoldingsTierSelectorProps {
  holdings: TokenHolding[];
  totalBankValue: number;
}

/* ── Desktop Pill Tabs ───────────────────────────────────── */
const TierTabs = ({
  tiers,
  activeIndex,
  onSelect,
  holdingsByTier,
  isDarkMode,
}: {
  tiers: TierConfig[];
  activeIndex: number;
  onSelect: (i: number) => void;
  holdingsByTier: Record<HoldingTier, TokenHolding[]>;
  isDarkMode: boolean;
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
      className={`relative inline-flex rounded-xl p-1 ${
        isDarkMode
          ? "bg-white/[0.04] border border-white/[0.06]"
          : "bg-gray-100 border border-gray-200/60"
      }`}
    >
      {/* Animated sliding indicator */}
      <motion.div
        className={`absolute top-1 bottom-1 rounded-lg ${
          isDarkMode ? "bg-white/[0.08]" : "bg-white shadow-sm"
        }`}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      />

      {tiers.map((tier, i) => {
        const count = holdingsByTier[tier.id]?.length || 0;
        const isActive = i === activeIndex;
        return (
          <button
            key={tier.id}
            data-tier-tab
            onClick={() => onSelect(i)}
            className={`relative z-10 flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors duration-200 whitespace-nowrap ${
              isActive
                ? isDarkMode
                  ? "text-white"
                  : "text-gray-900"
                : isDarkMode
                  ? "text-gray-500 hover:text-gray-300"
                  : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {/* Accent dot */}
            <span
              className={`w-2 h-2 rounded-full bg-gradient-to-r ${tier.accent} transition-opacity duration-200 ${
                isActive ? "opacity-100" : "opacity-40"
              }`}
            />
            {tier.label}
            {count > 0 && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md transition-colors duration-200 ${
                  isActive
                    ? isDarkMode
                      ? "bg-white/10 text-white/80"
                      : "bg-gray-200 text-gray-700"
                    : isDarkMode
                      ? "bg-white/[0.04] text-gray-600"
                      : "bg-gray-100 text-gray-400"
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

/* ── Dot Indicators (mobile) ─────────────────────────────── */
const DotIndicators = ({
  count,
  activeIndex,
  tiers,
}: {
  count: number;
  activeIndex: number;
  tiers: TierConfig[];
}) => (
  <div className="flex justify-center gap-2 mt-4 md:hidden">
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

/* ── Token Card ──────────────────────────────────────────── */
const TokenCard = ({
  token,
  index,
  totalBankValue,
  isDarkMode,
}: {
  token: TokenHolding;
  index: number;
  totalBankValue: number;
  isDarkMode: boolean;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.3, delay: index * 0.06 }}
    className={`token-card rounded-xl border p-5 ${
      isDarkMode
        ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
        : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
    } backdrop-blur-sm transition-all duration-300`}
  >
    <div className="flex items-center gap-3 mb-4">
      <img
        src={token.logo}
        alt={token.name}
        className="w-10 h-10 rounded-full"
        onError={(e) => {
          e.currentTarget.src = "/images/tokens/default.svg";
        }}
      />
      <div className="flex-1 min-w-0">
        <div
          className={`font-bold text-sm truncate ${
            isDarkMode ? "text-white" : "text-gray-900"
          }`}
        >
          {token.name}
        </div>
        <div
          className={`text-xs ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          {token.symbol}
        </div>
      </div>
      <div className="text-right">
        <div
          className={`text-sm font-bold ${
            isDarkMode ? "text-amber-400" : "text-amber-600"
          }`}
        >
          $
          {token.value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        <div
          className={`text-xs ${
            isDarkMode ? "text-gray-500" : "text-gray-500"
          }`}
        >
          {totalBankValue > 0
            ? `${((token.value / totalBankValue) * 100).toFixed(1)}%`
            : "\u2014"}
        </div>
      </div>
    </div>
    <div
      className={`flex items-center justify-between text-xs mb-2 ${
        isDarkMode ? "text-gray-500" : "text-gray-500"
      }`}
    >
      <span>Amount</span>
      <span
        className={`font-mono ${
          isDarkMode ? "text-gray-300" : "text-gray-700"
        }`}
      >
        {token.amount.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })}
      </span>
    </div>
    <div
      className={`h-1.5 rounded-full overflow-hidden ${
        isDarkMode ? "bg-white/[0.06]" : "bg-gray-200/60"
      }`}
    >
      <div
        className="h-full bg-gradient-to-r from-amber-400 to-budju-pink rounded-full transition-all duration-700"
        style={{
          width:
            totalBankValue > 0
              ? `${(token.value / totalBankValue) * 100}%`
              : "0%",
        }}
      />
    </div>
  </motion.div>
);

/* ── Main Component ──────────────────────────────────────── */
const HoldingsTierSelector = ({ holdings, totalBankValue }: HoldingsTierSelectorProps) => {
  const { isDarkMode } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragX = useMotionValue(0);

  // Group holdings by tier
  const holdingsByTier: Record<HoldingTier, TokenHolding[]> = {
    bluechip: [],
    defi: [],
    budju: [],
  };
  for (const h of holdings) {
    holdingsByTier[h.tier].push(h);
  }

  // Only show tiers that have holdings
  const activeTiers = TIER_CONFIGS.filter(
    (t) => holdingsByTier[t.id].length > 0,
  );

  // If no tiers have holdings, show all tiers as options anyway
  const tiers = activeTiers.length > 0 ? activeTiers : TIER_CONFIGS;
  const currentTier = tiers[activeIndex] || tiers[0];
  const currentHoldings = holdingsByTier[currentTier.id] || [];

  // Tier subtotal
  const tierValue = currentHoldings.reduce((s, t) => s + t.value, 0);

  const goToTier = useCallback(
    (index: number) => {
      setActiveIndex(Math.max(0, Math.min(index, tiers.length - 1)));
    },
    [tiers.length],
  );

  // Swipe handling for mobile
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      const swipeThreshold = 50;
      const velocityThreshold = 300;

      if (
        info.offset.x < -swipeThreshold ||
        info.velocity.x < -velocityThreshold
      ) {
        // Swiped left -> next tier
        goToTier(activeIndex + 1);
      } else if (
        info.offset.x > swipeThreshold ||
        info.velocity.x > velocityThreshold
      ) {
        // Swiped right -> previous tier
        goToTier(activeIndex - 1);
      }
    },
    [activeIndex, goToTier],
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goToTier(activeIndex + 1);
      if (e.key === "ArrowLeft") goToTier(activeIndex - 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, goToTier]);

  return (
    <div ref={containerRef}>
      {/* Desktop tabs — hidden on mobile */}
      <div className="hidden md:flex justify-center mb-6">
        <TierTabs
          tiers={tiers}
          activeIndex={activeIndex}
          onSelect={goToTier}
          holdingsByTier={holdingsByTier}
          isDarkMode={isDarkMode}
        />
      </div>

      {/* Mobile tier label — hidden on desktop */}
      <div className="md:hidden text-center mb-4">
        <div className="flex items-center justify-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${currentTier.accent}`}
          />
          <span
            className={`text-sm font-bold ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            {currentTier.label}
          </span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
              isDarkMode
                ? "bg-white/[0.06] text-gray-500"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            {currentHoldings.length}
          </span>
        </div>
        <p
          className={`text-[11px] mt-1 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          {currentTier.description}
        </p>
      </div>

      {/* Tier subtotal */}
      <motion.div
        key={currentTier.id + "-value"}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center mb-6"
      >
        <p
          className={`text-[10px] uppercase tracking-[0.15em] font-bold mb-1 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          {currentTier.label} Value
        </p>
        <span
          className={`text-2xl font-black font-display bg-gradient-to-r ${currentTier.accent} bg-clip-text text-transparent`}
        >
          $
          {tierValue.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </motion.div>

      {/* Swipeable card area (mobile) / Grid (desktop) */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        style={{ x: dragX, touchAction: "pan-y" }}
        className="cursor-grab active:cursor-grabbing md:cursor-default"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTier.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {currentHoldings.map((token, index) => (
              <TokenCard
                key={token.symbol + token.name}
                token={token}
                index={index}
                totalBankValue={totalBankValue}
                isDarkMode={isDarkMode}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Empty state */}
      {currentHoldings.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`text-center py-12 rounded-xl border ${
            isDarkMode
              ? "bg-white/[0.02] border-white/[0.04] text-gray-600"
              : "bg-gray-50 border-gray-200/40 text-gray-400"
          }`}
        >
          <p className="text-sm font-medium">No {currentTier.label} holdings yet</p>
          <p className="text-xs mt-1 opacity-60">
            Holdings in this category will appear here
          </p>
        </motion.div>
      )}

      {/* Mobile dot indicators */}
      {tiers.length > 1 && (
        <DotIndicators
          count={tiers.length}
          activeIndex={activeIndex}
          tiers={tiers}
        />
      )}

      {/* Swipe hint (mobile only, shows briefly) */}
      <motion.p
        initial={{ opacity: 0.6 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1, delay: 3 }}
        className="md:hidden text-center text-[10px] text-gray-600 mt-2"
      >
        Swipe to browse categories
      </motion.p>
    </div>
  );
};

export default HoldingsTierSelector;
