import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes, FaArrowUp, FaArrowDown } from "react-icons/fa";
import { fetchTraderState, ASSET_CONFIG } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prices: Record<string, number>;
  changes?: Record<string, number>;
}

const AutoTraderView = ({ isOpen, onClose, prices, changes = {} }: Props) => {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchTraderState().then((data) => {
      setState(data);
      setLoading(false);
      setCountdown(30);
    });
  }, [isOpen]);

  // Auto-refresh + countdown while open
  useEffect(() => {
    if (!isOpen) return;
    const refreshInterval = setInterval(() => {
      fetchTraderState().then((data) => {
        if (data) setState(data);
        setCountdown(30);
      });
    }, 30_000);
    const countdownInterval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1_000);
    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
    };
  }, [isOpen]);

  // Build monitoring data from tier config + assignments
  // Uses autoActive.targets for real buy/sell triggers when available
  const getMonitoringData = () => {
    if (!state) return [];
    const assignments = state.autoTierAssignments || {};
    const tierAssets = state.autoTierAssets || {};
    const cooldowns = state.autoCooldowns || {};
    const autoActive = state._rawAutoActive || {};
    const liveTargets = autoActive.targets || {};
    const tierActive = autoActive.tierActive || {};

    // Build coin→tierKey map from assignments first
    const coinTierMap: Record<string, string> = {};
    for (const [coin, tierKey] of Object.entries(assignments)) {
      coinTierMap[coin] = tierKey as string;
    }

    // If assignments is empty, build from tier coins arrays
    if (Object.keys(coinTierMap).length === 0) {
      for (const [tierKey, cfg] of Object.entries(tierAssets) as [string, any][]) {
        const coins = cfg.coins || [];
        for (const coin of coins) {
          coinTierMap[coin] = tierKey;
        }
      }
    }

    // If still empty, build from liveTargets (coins being actively monitored)
    if (Object.keys(coinTierMap).length === 0) {
      for (const coin of Object.keys(liveTargets)) {
        coinTierMap[coin] = "tier1"; // fallback tier key
      }
    }

    const items: any[] = [];
    for (const [coin, tierKey] of Object.entries(coinTierMap)) {
      const tier = tierAssets[tierKey] || {};
      const dev = Number(tier.deviation) || 0;
      const cp = Number(prices[coin]) || 0;
      const change = Number(changes[coin]) || 0;
      const live = liveTargets[coin];

      // Check if this coin's tier is actually active
      const tierNum = tierKey.replace("tier", "");
      const isTierActive = !!(tierActive[tierNum] ?? tierActive[tierKey] ?? tier.active);

      items.push({
        coin,
        tierKey,
        tierName: tier.name || tierKey.replace("tier", "T"),
        deviation: dev,
        currentPrice: cp,
        // Use real targets from autoActive when available, fall back to calculated
        buyTrigger: live ? live.buy : (cp > 0 ? cp * (1 - dev / 100) : 0),
        sellTrigger: live ? live.sell : (cp > 0 ? cp * (1 + dev / 100) : 0),
        change24h: change,
        inCooldown: !!(cooldowns[coin] && Date.now() < cooldowns[coin]),
        hasLiveTarget: !!live,
        isTierActive,
      });
    }
    return items;
  };

  // Group monitoring by tier
  const getGrouped = () => {
    const data = getMonitoringData();
    const groups: Record<string, any[]> = {};
    for (const item of data) {
      if (!groups[item.tierKey]) groups[item.tierKey] = [];
      groups[item.tierKey].push(item);
    }
    return groups;
  };

  const grouped = getGrouped();
  const monitoringCount = Object.values(grouped).reduce((s, g) => s + g.length, 0);
  const tradeLog = state?.autoTradeLog || [];
  const botActive = state?.autoBotActive ?? false;

  const formatPrice = (n: number) => {
    if (!n || isNaN(n)) return "$0.00";
    if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(4)}`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
            className="absolute inset-x-0 bottom-0 top-14 bg-[#0a0a1a] rounded-t-2xl overflow-y-auto pb-20"
            style={{ maxWidth: 420, margin: "0 auto" }}
          >
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </div>
                  <span className="text-base font-bold text-slate-200">Auto Trader</span>
                  {botActive && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-xl" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <FaTimes size={14} className="text-slate-400" />
                </button>
              </div>

              {/* View-only notice */}
              <div className="text-[11px] text-slate-500 text-center mb-3 py-1.5 px-2.5 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                View only — the bot is managed by the pool admin
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <>
                  {/* Monitoring count banner with countdown */}
                  <div className="rounded-lg p-2 mb-3 flex items-center justify-between" style={{ background: "rgba(168,85,247,0.1)" }}>
                    <span className="text-[10px] font-bold text-slate-300">
                      Monitoring {monitoringCount} coins
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {countdown}s
                    </span>
                  </div>

                  {/* Coin monitoring grouped by tier */}
                  {monitoringCount === 0 ? (
                    <div className="text-[10px] text-slate-500 text-center py-4 mb-3">
                      No coins configured for monitoring yet.
                    </div>
                  ) : Object.entries(grouped).map(([tierKey, coins]) => {
                    const tierCfg = (state?.autoTierAssets || {})[tierKey] || {};
                    const tierName = tierCfg.name || tierKey.replace("tier", "Tier ");
                    const dev = Number(tierCfg.deviation) || 0;
                    const alloc = Number(tierCfg.allocation) || 0;
                    // Use the real active state from monitoring data
                    const tierActive = coins.some((c: any) => c.isTierActive);

                    return (
                      <div key={tierKey} className="mb-3">
                        {/* Tier header */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold" style={{ color: "#a855f7" }}>
                              {tierKey.replace("tier", "T")} – {tierName}
                            </span>
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg"
                              style={{
                                background: tierActive ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)",
                                color: tierActive ? "#22c55e" : "#64748b",
                              }}
                            >
                              {tierActive ? "ACTIVE" : "OFF"}
                            </span>
                          </div>
                          <div className="flex gap-3 text-[10px]">
                            <span className="text-slate-500">
                              Dev <span className="font-bold text-blue-400">{dev}%</span>
                            </span>
                            <span className="text-slate-500">
                              Alloc <span className="font-bold text-green-400">{alloc}%</span>
                            </span>
                          </div>
                        </div>

                        {/* Coin cards within tier */}
                        <div className="space-y-1.5">
                          {coins.map((item: any) => {
                            const cfg = ASSET_CONFIG[item.coin] || { color: "#64748b", icon: item.coin.charAt(0) };
                            const changeColor = item.change24h > 0 ? "#22c55e" : item.change24h < 0 ? "#ef4444" : "#64748b";

                            // Calculate distance to each trigger
                            const pctToBuy = item.currentPrice > 0 && item.buyTrigger > 0
                              ? ((item.currentPrice - item.buyTrigger) / item.currentPrice) * 100
                              : 100;
                            const pctToSell = item.currentPrice > 0 && item.sellTrigger > 0
                              ? ((item.sellTrigger - item.currentPrice) / item.currentPrice) * 100
                              : 100;
                            const nearestSide: "buy" | "sell" = pctToBuy <= pctToSell ? "buy" : "sell";
                            const nearestPct = Math.max(0, nearestSide === "buy" ? pctToBuy : pctToSell);

                            // Calculate proximity to trigger
                            let progress = 0;
                            if (item.currentPrice > 0 && item.buyTrigger > 0 && item.sellTrigger > 0) {
                              const mid = (item.buyTrigger + item.sellTrigger) / 2;
                              const halfRange = (item.sellTrigger - item.buyTrigger) / 2;
                              if (halfRange > 0) {
                                progress = item.currentPrice < mid
                                  ? (mid - item.currentPrice) / halfRange
                                  : (item.currentPrice - mid) / halfRange;
                              }
                            }
                            progress = Math.max(0, Math.min(1, progress));

                            const isNear = progress >= 0.65;
                            const isHot = progress >= 0.85;
                            const isCritical = progress >= 0.95;

                            // Bi-directional bar: green left (buy), red right (sell)
                            // direction: -1 = toward buy (left), +1 = toward sell (right)
                            let direction = 0;
                            if (item.currentPrice > 0 && item.buyTrigger > 0 && item.sellTrigger > 0) {
                              const mid = (item.buyTrigger + item.sellTrigger) / 2;
                              direction = item.currentPrice >= mid ? 1 : -1;
                            }
                            const barColorBuy = isCritical ? "#22c55e" : isHot ? "#4ade80" : isNear ? "#86efac" : "#22c55e";
                            const barColorSell = isCritical ? "#ef4444" : isHot ? "#f97316" : isNear ? "#eab308" : "#ef4444";

                            return (
                              <div
                                key={item.coin}
                                className="rounded-lg p-2.5 transition-all duration-500"
                                style={{
                                  background: item.inCooldown
                                    ? "rgba(234,179,8,0.05)"
                                    : isCritical && item.hasLiveTarget
                                      ? nearestSide === "buy" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"
                                      : isHot && item.hasLiveTarget
                                        ? "rgba(249,115,22,0.06)"
                                        : "rgba(255,255,255,0.02)",
                                  border: `1px solid ${
                                    item.inCooldown
                                      ? "rgba(234,179,8,0.2)"
                                      : isCritical && item.hasLiveTarget
                                        ? nearestSide === "buy" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"
                                        : isHot && item.hasLiveTarget
                                          ? "rgba(249,115,22,0.3)"
                                          : "rgba(255,255,255,0.04)"
                                  }`,
                                  boxShadow: isCritical && item.hasLiveTarget && !item.inCooldown
                                    ? nearestSide === "buy"
                                      ? "0 0 12px rgba(34,197,94,0.15), inset 0 0 12px rgba(34,197,94,0.05)"
                                      : "0 0 12px rgba(239,68,68,0.15), inset 0 0 12px rgba(239,68,68,0.05)"
                                    : isHot && item.hasLiveTarget && !item.inCooldown
                                      ? "0 0 8px rgba(249,115,22,0.1)"
                                      : "none",
                                }}
                              >
                                {/* Coin name + status badge + change */}
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold" style={{ color: cfg.color }}>
                                      {item.coin}
                                    </span>
                                    {item.inCooldown && <span className="text-[9px] text-yellow-500">(cooldown)</span>}
                                    {item.hasLiveTarget && !item.inCooldown && isNear ? (
                                      <span
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded${isCritical ? " animate-pulse" : ""}`}
                                        style={{
                                          background: nearestSide === "buy"
                                            ? isCritical ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.15)"
                                            : isCritical ? "rgba(239,68,68,0.25)" : "rgba(239,68,68,0.15)",
                                          color: nearestSide === "buy" ? "#22c55e" : "#ef4444",
                                          border: `1px solid ${nearestSide === "buy" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                                        }}
                                      >
                                        {isCritical ? (nearestSide === "buy" ? "BUY IMMINENT" : "SELL IMMINENT")
                                          : isHot ? (nearestSide === "buy" ? "NEAR BUY" : "NEAR SELL")
                                          : (nearestSide === "buy" ? "~ BUY" : "~ SELL")}
                                      </span>
                                    ) : item.hasLiveTarget && !item.inCooldown ? (
                                      <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                                        LIVE
                                      </span>
                                    ) : null}
                                    <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7" }}>
                                      {tierKey.replace("tier", "T")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1" style={{ color: changeColor }}>
                                    {item.change24h > 0 ? <FaArrowUp size={8} /> : item.change24h < 0 ? <FaArrowDown size={8} /> : null}
                                    <span className="text-[10px] font-bold font-mono">
                                      {item.change24h > 0 ? "+" : ""}{item.change24h.toFixed(1)}%
                                    </span>
                                  </div>
                                </div>

                                {/* Bi-directional progress bar: green left (buy) ← center → red right (sell) */}
                                <div className="w-full h-2 rounded-full mb-1.5 relative overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                                  {/* Center tick mark */}
                                  <div className="absolute top-0 bottom-0 w-px" style={{ left: "50%", background: "rgba(255,255,255,0.25)", zIndex: 2 }} />
                                  {direction <= 0 ? (
                                    /* Buy side: bar grows LEFT from center */
                                    <div
                                      className="absolute top-0 bottom-0 rounded-l-full transition-all duration-700"
                                      style={{
                                        right: "50%",
                                        width: `${(progress * 50).toFixed(1)}%`,
                                        background: barColorBuy,
                                        opacity: isCritical ? 1 : 0.8,
                                        boxShadow: isCritical ? `0 0 8px ${barColorBuy}` : "none",
                                      }}
                                    />
                                  ) : (
                                    /* Sell side: bar grows RIGHT from center */
                                    <div
                                      className="absolute top-0 bottom-0 rounded-r-full transition-all duration-700"
                                      style={{
                                        left: "50%",
                                        width: `${(progress * 50).toFixed(1)}%`,
                                        background: barColorSell,
                                        opacity: isCritical ? 1 : 0.8,
                                        boxShadow: isCritical ? `0 0 8px ${barColorSell}` : "none",
                                      }}
                                    />
                                  )}
                                </div>

                                {/* Buy / Current / Sell row */}
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className={pctToBuy <= pctToSell && item.hasLiveTarget ? "text-green-400 font-bold" : "text-green-400/70"}>
                                    Buy &lt; {formatPrice(item.buyTrigger)}
                                  </span>
                                  <span className="text-slate-300 font-bold">{formatPrice(item.currentPrice)}</span>
                                  <span className={pctToSell < pctToBuy && item.hasLiveTarget ? "text-red-400 font-bold" : "text-red-400/70"}>
                                    Sell &gt; {formatPrice(item.sellTrigger)}
                                  </span>
                                </div>

                                {/* Proximity percentage */}
                                {item.hasLiveTarget && !item.inCooldown && (
                                  <div className="mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                    <span className="text-[9px] font-mono" style={{
                                      color: isCritical ? (nearestSide === "buy" ? "#22c55e" : "#ef4444")
                                        : isHot ? "#f97316"
                                        : "#64748b",
                                    }}>
                                      {nearestPct.toFixed(1)}% to {nearestSide}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Trade Log */}
                  <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(59,130,246,0.15)" }}>
                    <div className="px-2.5 py-1.5" style={{ background: "rgba(59,130,246,0.08)" }}>
                      <span className="text-[10px] font-bold" style={{ color: "#3b82f6" }}>Trade Log</span>
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {tradeLog.length === 0 ? (
                        <div className="text-[10px] text-slate-500 text-center py-3">
                          No auto-trades yet. Trades will appear here when triggered.
                        </div>
                      ) : (
                        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                          {tradeLog.slice(0, 20).map((entry: any, i: number) => {
                            const isSell = entry.side?.toLowerCase() === "sell";
                            const qty = Number(entry.qty) || 0;
                            const price = Number(entry.price) || 0;
                            const total = qty * price;
                            const coinCfg = ASSET_CONFIG[entry.coin] || { color: "#64748b" };
                            return (
                              <div key={i} className="flex items-center justify-between px-2.5 py-2">
                                <div className="flex items-center gap-2">
                                  <span style={{ color: isSell ? "#ef4444" : "#22c55e", fontSize: 10 }}>
                                    {isSell ? "▼" : "▲"}
                                  </span>
                                  <span className="text-[11px] font-bold" style={{ color: coinCfg.color }}>
                                    {entry.coin}
                                  </span>
                                  <span className="text-[10px] font-bold" style={{ color: isSell ? "#ef4444" : "#22c55e" }}>
                                    {entry.side?.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-slate-500 font-mono">
                                    {qty.toFixed(4)} @ {formatPrice(price)}
                                  </div>
                                  <div className="text-[11px] font-bold text-white font-mono">
                                    {formatPrice(total)}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Empty state */}
                  {monitoringCount === 0 && tradeLog.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No auto-trade configuration found
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AutoTraderView;
