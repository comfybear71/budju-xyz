import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { FaTimes, FaArrowUp, FaArrowDown, FaStop, FaPlay } from "react-icons/fa";
import { fetchTraderState, ASSET_CONFIG, type TraderState } from "../services/tradeApi";

interface Props {
  prices: Record<string, number>;
  changes: Record<string, number>;
  onClose: () => void;
}

interface MonitoringItem {
  coin: string;
  tierKey: string;
  tierName: string;
  deviation: number;
  currentPrice: number;
  buyTrigger: number;
  sellTrigger: number;
  change24h: number;
  inCooldown: boolean;
}

const AdminAutoTradeView = ({ prices, changes, onClose }: Props) => {
  const [state, setState] = useState<TraderState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTraderState().then((data) => {
      setState(data);
      setLoading(false);
    });
  }, []);

  // Auto-refresh state every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTraderState().then((data) => {
        if (data) setState(data);
      });
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const botActive = state?.autoBotActive ?? false;

  // Build tiers from autoTierAssets
  const getTiers = () => {
    if (!state) return [];
    const tierAssets = state.autoTierAssets || {};
    const assignments = state.autoTierAssignments || {};

    // Group coins by tier from assignments
    const tierCoins: Record<string, string[]> = {};
    for (const [coin, tier] of Object.entries(assignments)) {
      const k = tier as string;
      if (!tierCoins[k]) tierCoins[k] = [];
      tierCoins[k].push(coin);
    }

    return Object.entries(tierAssets).map(([key, cfg]: [string, any]) => ({
      key,
      name: cfg.name || key.replace("tier", "Tier "),
      deviation: Number(cfg.deviation) || 0,
      allocation: Number(cfg.allocation) || 0,
      coins: tierCoins[key] || cfg.coins || [],
      active: cfg.active !== false,
    }));
  };

  // Build monitoring data — from assignments or tier coins
  const getMonitoringData = (): MonitoringItem[] => {
    if (!state) return [];
    const assignments = state.autoTierAssignments || {};
    const tierAssets = state.autoTierAssets || {};
    const cooldowns = state.autoCooldowns || {};

    const coinTierMap: Record<string, string> = {};
    for (const [coin, tierKey] of Object.entries(assignments)) {
      coinTierMap[coin] = tierKey as string;
    }

    // Fallback: build from tier coins arrays if assignments empty
    if (Object.keys(coinTierMap).length === 0) {
      for (const [tierKey, cfg] of Object.entries(tierAssets) as [string, any][]) {
        const coins = cfg.coins || [];
        for (const coin of coins) {
          coinTierMap[coin] = tierKey;
        }
      }
    }

    const items: MonitoringItem[] = [];
    for (const [coin, tierKey] of Object.entries(coinTierMap)) {
      const tier = (tierAssets as any)[tierKey] || {};
      const dev = Number(tier.deviation) || 0;
      const cp = Number(prices[coin]) || 0;
      const change = Number(changes[coin]) || 0;
      items.push({
        coin,
        tierKey,
        tierName: tier.name || tierKey.replace("tier", "T"),
        deviation: dev,
        currentPrice: cp,
        buyTrigger: cp > 0 ? cp * (1 - dev / 100) : 0,
        sellTrigger: cp > 0 ? cp * (1 + dev / 100) : 0,
        change24h: change,
        inCooldown: !!(cooldowns[coin] && Date.now() < cooldowns[coin]),
      });
    }
    return items;
  };

  // Group monitoring by tier
  const getGrouped = () => {
    const data = getMonitoringData();
    const groups: Record<string, MonitoringItem[]> = {};
    for (const item of data) {
      if (!groups[item.tierKey]) groups[item.tierKey] = [];
      groups[item.tierKey].push(item);
    }
    return groups;
  };

  const tiers = getTiers();
  const grouped = getGrouped();
  const monitoringCount = getMonitoringData().length;
  const tradeLog = state?.autoTradeLog || [];

  const formatPrice = (n: number) => {
    if (!n || isNaN(n)) return "$0.00";
    if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(4)}`;
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm p-4">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          </div>
          <span className="text-base font-bold text-slate-200">Auto Trade</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-xl"
            style={{
              background: botActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
              color: botActive ? "#22c55e" : "#ef4444",
            }}
          >
            {botActive ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Stop / Start button */}
          <button
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
            style={{
              background: botActive ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)",
              border: `1px solid ${botActive ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}`,
              color: botActive ? "#ef4444" : "#22c55e",
            }}
          >
            {botActive ? <><FaStop size={8} /> Stop</> : <><FaPlay size={8} /> Start</>}
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <FaTimes size={12} className="text-slate-400" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Tier cards — horizontal scroll */}
        {tiers.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
            {tiers.map((tier) => {
              const cooldowns = state?.autoCooldowns || {};
              return (
                <div
                  key={tier.key}
                  className="flex-shrink-0 rounded-xl p-3"
                  style={{
                    background: "rgba(168,85,247,0.06)",
                    border: "1px solid rgba(168,85,247,0.15)",
                    minWidth: 200,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[12px] font-bold" style={{ color: "#a855f7" }}>
                      {tier.key.replace("tier", "T")} – {tier.name}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-lg"
                      style={{
                        background: tier.active ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)",
                        color: tier.active ? "#22c55e" : "#64748b",
                      }}
                    >
                      {tier.active ? "ON" : "OFF"}
                    </span>
                  </div>

                  {/* Coin tags */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tier.coins.map((coin: string) => {
                      const cfg = ASSET_CONFIG[coin] || { color: "#64748b" };
                      const cd = cooldowns[coin] && Date.now() < cooldowns[coin];
                      return (
                        <span
                          key={coin}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                          style={{
                            background: cfg.color + "20",
                            border: `1px solid ${cfg.color}40`,
                            color: cfg.color,
                          }}
                        >
                          {coin}{cd ? " (cd)" : ""}
                        </span>
                      );
                    })}
                  </div>

                  {/* Dev / Alloc */}
                  <div className="flex gap-3 text-[10px]">
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

        {/* Monitoring header */}
        {monitoringCount > 0 && (
          <div className="rounded-lg p-2 flex items-center justify-between" style={{ background: "rgba(168,85,247,0.1)" }}>
            <span className="text-[10px] font-bold text-slate-300">
              Monitoring {monitoringCount} coins
            </span>
          </div>
        )}

        {/* Coin monitoring grouped by tier */}
        {Object.entries(grouped).map(([tierKey, coins]) => {
          const tierCfg = (state?.autoTierAssets || {} as any)[tierKey] || {};
          const tierName = tierCfg.name || tierKey.replace("tier", "Tier ");

          return (
            <div key={tierKey}>
              {/* Tier group label */}
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#a855f7" }}>
                {tierKey.replace("tier", "T")} – {tierName}
              </div>

              <div className="space-y-1.5">
                {coins.map((item) => {
                  const cfg = ASSET_CONFIG[item.coin] || { color: "#64748b", icon: item.coin.charAt(0) };
                  const changeColor = item.change24h > 0 ? "#22c55e" : item.change24h < 0 ? "#ef4444" : "#64748b";

                  return (
                    <div
                      key={item.coin}
                      className="rounded-lg p-2.5"
                      style={{
                        background: item.inCooldown ? "rgba(234,179,8,0.05)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${item.inCooldown ? "rgba(234,179,8,0.2)" : "rgba(255,255,255,0.04)"}`,
                      }}
                    >
                      {/* Coin name + tier badge + change */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: cfg.color }}>
                            {item.coin}
                          </span>
                          {item.inCooldown && <span className="text-[9px] text-yellow-500">(cooldown)</span>}
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

                      {/* Progress bar */}
                      <div className="w-full h-1.5 rounded-full mb-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: cfg.color,
                            width: `${Math.min(100, item.deviation * 15)}%`,
                            opacity: 0.7,
                          }}
                        />
                      </div>

                      {/* Buy / Current / Sell row */}
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-green-400/70">Buy &lt; {formatPrice(item.buyTrigger)}</span>
                        <span className="text-slate-300 font-bold">{formatPrice(item.currentPrice)}</span>
                        <span className="text-red-400/70">Sell &gt; {formatPrice(item.sellTrigger)}</span>
                      </div>
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
        {tiers.length === 0 && monitoringCount === 0 && tradeLog.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs">
            No auto-trade configuration found
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AdminAutoTradeView;
