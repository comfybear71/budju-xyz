import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { FaTimes } from "react-icons/fa";
import { fetchTraderState, ASSET_CONFIG } from "../services/tradeApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  prices: Record<string, number>;
}

const AutoTraderView = ({ isOpen, onClose, prices }: Props) => {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchTraderState().then((data) => {
      setState(data);
      setLoading(false);
    });
  }, [isOpen]);

  // Build tier list from autoTierAssets + autoTierAssignments
  const getTiers = () => {
    if (!state) return [];
    const tierAssets = state.autoTierAssets || {};
    const assignments = state.autoTierAssignments || {};

    // Group coins by tier
    const tierCoins: Record<string, string[]> = {};
    for (const [coin, tier] of Object.entries(assignments)) {
      const k = tier as string;
      if (!tierCoins[k]) tierCoins[k] = [];
      tierCoins[k].push(coin);
    }

    return Object.entries(tierAssets).map(([key, cfg]: [string, any]) => ({
      key,
      name: cfg.name || key.replace("tier", "Tier "),
      deviation: cfg.deviation || 0,
      allocation: cfg.allocation || 0,
      coins: tierCoins[key] || cfg.coins || [],
      active: cfg.active !== false,
    }));
  };

  // Build monitoring data — all assigned coins with trigger levels
  const getMonitoringData = () => {
    if (!state) return [];
    const assignments = state.autoTierAssignments || {};
    const tierAssets = state.autoTierAssets || {};
    const cooldowns = state.autoCooldowns || {};

    const items: any[] = [];
    for (const [coin, tierKey] of Object.entries(assignments)) {
      const tier = tierAssets[tierKey as string] || {};
      const dev = tier.deviation || 0;
      const cp = prices[coin] || 0;
      items.push({
        coin,
        tierKey: tierKey as string,
        tierName: tier.name || (tierKey as string).replace("tier", "T"),
        deviation: dev,
        currentPrice: cp,
        buyTrigger: cp * (1 - dev / 100),
        sellTrigger: cp * (1 + dev / 100),
        inCooldown: !!(cooldowns[coin] && Date.now() < cooldowns[coin]),
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

  const tiers = getTiers();
  const grouped = getGrouped();
  const tradeLog = state?.autoTradeLog || [];
  const botActive = state?.autoBotActive ?? false;
  const monitoringCount = getMonitoringData().length;

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
              {/* Header — matches FLUB userAutoTraderModal */}
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
                  {/* Bot Settings — tier cards */}
                  {tiers.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {tiers.map((tier) => {
                        const cooldowns = state?.autoCooldowns || {};
                        return (
                          <div
                            key={tier.key}
                            className="rounded-xl p-3"
                            style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.15)" }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[13px] font-bold" style={{ color: "#a855f7" }}>
                                {tier.key.replace("tier", "T")} – {tier.name}
                              </span>
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-xl"
                                style={{
                                  background: tier.active ? "rgba(168,85,247,0.2)" : "rgba(100,116,139,0.2)",
                                  color: tier.active ? "#a855f7" : "#64748b",
                                }}
                              >
                                {tier.active ? "ACTIVE" : "INACTIVE"}
                              </span>
                            </div>

                            {/* Coin tags */}
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {tier.coins.map((coin: string) => {
                                const cfg = ASSET_CONFIG[coin] || { color: "#64748b" };
                                const cd = cooldowns[coin] && Date.now() < cooldowns[coin];
                                return (
                                  <span
                                    key={coin}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                                    style={{
                                      background: cfg.color + "20",
                                      border: `1px solid ${cfg.color}40`,
                                      color: cfg.color,
                                    }}
                                  >
                                    {coin}
                                    {cd ? " (cd)" : ""}
                                  </span>
                                );
                              })}
                            </div>

                            {/* Dev / Alloc */}
                            <div className="flex gap-4 text-[11px]">
                              <span className="text-slate-500">
                                Dev <span className="font-bold text-blue-400">{tier.deviation}%</span>
                              </span>
                              <span className="text-slate-500">
                                Alloc <span className="font-bold text-green-400">{tier.allocation}%</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Coin Monitoring */}
                  {monitoringCount > 0 && (
                    <div className="mb-3">
                      <div className="rounded-lg p-2 mb-2" style={{ background: "rgba(168,85,247,0.1)" }}>
                        <span className="text-[10px] font-bold text-slate-300">
                          Monitoring {monitoringCount} coins
                        </span>
                      </div>

                      {Object.entries(grouped).map(([tierKey, coins]) => {
                        const tierCfg = state?.autoTierAssets?.[tierKey] || {};
                        const tierName = tierCfg.name || tierKey.replace("tier", "T");
                        return (
                          <div key={tierKey} className="mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#a855f7" }}>
                              {tierKey.replace("tier", "T")} – {tierName}
                            </div>
                            <div className="space-y-1.5">
                              {coins.map((item: any) => {
                                const cfg = ASSET_CONFIG[item.coin] || { color: "#64748b" };
                                return (
                                  <div
                                    key={item.coin}
                                    className="rounded-lg p-2"
                                    style={{
                                      background: item.inCooldown ? "rgba(234,179,8,0.05)" : "rgba(255,255,255,0.02)",
                                      border: `1px solid ${item.inCooldown ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.04)"}`,
                                    }}
                                  >
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-bold" style={{ color: cfg.color }}>
                                        {item.coin}
                                        {item.inCooldown && <span className="text-[9px] text-yellow-500 ml-1">(cd)</span>}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}>
                                          {tierKey.replace("tier", "T")}
                                        </span>
                                        {/* Deviation bar */}
                                        <div className="w-12 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                                          <div
                                            className="h-full rounded-full"
                                            style={{ background: cfg.color, width: `${Math.min(100, item.deviation * 15)}%` }}
                                          />
                                        </div>
                                        <span className="text-[10px] font-bold text-slate-400">
                                          {item.deviation}%
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                      <span>Buy &lt; ${item.buyTrigger.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                      <span className="text-slate-400">${item.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                      <span>Sell &gt; ${item.sellTrigger.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Trade Log — matches FLUB auto section trade log */}
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
                            const total = (Number(entry.qty) || 0) * (Number(entry.price) || 0);
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
                                    {Number(entry.qty).toFixed(4)} @ ${Number(entry.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </div>
                                  <div className="text-[11px] font-bold text-white font-mono">
                                    ${total.toFixed(2)}
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
                  {tiers.length === 0 && monitoringCount === 0 && tradeLog.length === 0 && (
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
