import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { FaTimes, FaArrowUp, FaArrowDown, FaStop, FaPlay, FaPlus, FaSync, FaSave, FaCheck } from "react-icons/fa";
import { ASSET_CONFIG, syncSwyftxTradesToDB, resetAdminAuthDenied, fetchSwyftxOrderHistory } from "../services/tradeApi";
import { AutoTrader, TIER_CONFIG, type RecentTrade } from "../services/autoTrader";

interface Props {
  prices: Record<string, number>;
  changes: Record<string, number>;
  adminWallet: string;
  onClose: () => void;
  autoTrader: AutoTrader;
}

// Coins available for auto-trading (exclude stables/fiat)
const AVAILABLE_COINS = Object.keys(ASSET_CONFIG).filter(
  (c) => c !== "USDC" && c !== "AUD" && c !== "USD"
);

const AdminAutoTradeView = ({ prices, changes, adminWallet, onClose, autoTrader }: Props) => {
  const [, setTick] = useState(0);
  const [addCoinTier, setAddCoinTier] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(30);
  const [startingTier, setStartingTier] = useState<number | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [swyftxTrades, setSwyftxTrades] = useState<any[]>([]);

  // Force re-render when autoTrader state changes
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    autoTrader.setOnStateChange(refresh);
    return () => autoTrader.setOnStateChange(() => {});
  }, [autoTrader, refresh]);

  // Load actual Swyftx trade history on mount (no signing needed — proxy handles auth)
  useEffect(() => {
    fetchSwyftxOrderHistory(50).then(setSwyftxTrades).catch(() => {});
  }, []);

  // Countdown timer for next price check
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 30));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Feed prices to autoTrader
  useEffect(() => {
    autoTrader.updatePrices(prices);
  }, [autoTrader, prices]);

  const snapshot = autoTrader.getSnapshot();
  const botActive = snapshot.isActive;

  // Build tier data
  const getTiers = () => {
    const tiers = [];
    for (let t = 1; t <= 3; t++) {
      const cfg = TIER_CONFIG[t];
      const settings = snapshot.tierSettings[`tier${t}`];
      const coins = autoTrader.getCoinsForTier(t);
      const active = snapshot.tierActive[t] || false;
      tiers.push({ num: t, cfg, settings, coins, active });
    }
    return tiers;
  };

  // Get all assigned coins
  const getAssignedCoins = (): Set<string> => {
    return new Set(Object.keys(snapshot.tierAssignments));
  };

  // Build monitoring data
  const getMonitoringData = () => {
    const items: any[] = [];
    for (let t = 1; t <= 3; t++) {
      if (!snapshot.tierActive[t]) continue;
      const coins = autoTrader.getCoinsForTier(t);
      const settings = snapshot.tierSettings[`tier${t}`];
      for (const coin of coins) {
        const cp = Number(prices[coin]) || 0;
        const change = Number(changes[coin]) || 0;
        const target = snapshot.targets[coin];
        const inCooldown = autoTrader._isOnCooldown(coin);
        const recentTrade = autoTrader.getRecentTrade(coin);
        items.push({
          coin,
          tierNum: t,
          tierName: TIER_CONFIG[t].name,
          deviation: settings.deviation,
          currentPrice: cp,
          buyTrigger: target ? target.buy : (cp > 0 ? cp * (1 - settings.deviation / 100) : 0),
          sellTrigger: target ? target.sell : (cp > 0 ? cp * (1 + settings.deviation / 100) : 0),
          change24h: change,
          inCooldown,
          hasTarget: !!target,
          recentTrade,
        });
      }
    }
    return items;
  };

  // Group by tier
  const getGrouped = () => {
    const data = getMonitoringData();
    const groups: Record<number, any[]> = {};
    for (const item of data) {
      if (!groups[item.tierNum]) groups[item.tierNum] = [];
      groups[item.tierNum].push(item);
    }
    return groups;
  };

  const tiers = getTiers();
  const grouped = getGrouped();
  const monitoringCount = getMonitoringData().length;
  // Use Swyftx trades (actual exchange data) for the trade log
  // Swyftx BUY: 'quantity' = AUD spent, 'amount' = crypto received
  // Swyftx SELL: 'quantity' = crypto sold, total AUD = quantity * price
  const tradeLog = swyftxTrades.map((t: any) => {
    const price = t.trigger || t.price || 0;
    const isSell = t.type === "sell";
    const cryptoQty = isSell
      ? (t.quantity || 0)
      : (price > 0 ? (t.quantity || 0) / price : (t.amount || 0));
    const audTotal = isSell
      ? (t.quantity || 0) * price
      : (t.quantity || 0); // quantity IS the AUD amount for buys
    return {
      time: t.timestamp || "",
      coin: t.coin || "",
      side: (isSell ? "SELL" : "BUY") as "BUY" | "SELL",
      quantity: cryptoQty,
      price,
      amount: audTotal,
    };
  });
  const buyCount = tradeLog.filter((e) => e.side !== "SELL").length;
  const sellCount = tradeLog.filter((e) => e.side === "SELL").length;
  const assignedCoins = getAssignedCoins();

  const [tierError, setTierError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<number, "idle" | "saving" | "saved" | "error">>({});
  const [saveError, setSaveError] = useState<Record<number, string>>({});

  const handleStartTier = async (tierNum: number) => {
    setStartingTier(tierNum);
    setTierError(null);
    const result = await autoTrader.startTier(tierNum);
    setStartingTier(null);
    if (!result.success && result.error) {
      setTierError(result.error);
      setTimeout(() => setTierError(null), 5000);
    }
  };

  const handleStopTier = (tierNum: number) => {
    autoTrader.stopTier(tierNum);
  };

  const handleOverrideCooldowns = (tierNum: number) => {
    autoTrader.overrideCooldowns(tierNum);
  };

  const handleUpdateDeviation = (tierNum: number, deviation: number) => {
    autoTrader.updateTierSettings(tierNum, { deviation });
    setSaveStatus((prev) => ({ ...prev, [tierNum]: "idle" }));
  };

  const handleUpdateAllocation = (tierNum: number, allocation: number) => {
    autoTrader.updateTierSettings(tierNum, { allocation });
    setSaveStatus((prev) => ({ ...prev, [tierNum]: "idle" }));
  };

  const handleSaveSettings = async (tierNum: number) => {
    setSaveStatus((prev) => ({ ...prev, [tierNum]: "saving" }));
    setSaveError((prev) => ({ ...prev, [tierNum]: "" }));
    resetAdminAuthDenied(); // Reset denied state so retry prompts for signature again
    const result = await autoTrader.saveTierSettingsForTier(tierNum);
    if (result.ok) {
      setSaveStatus((prev) => ({ ...prev, [tierNum]: "saved" }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [tierNum]: "idle" })), 3000);
    } else {
      setSaveStatus((prev) => ({ ...prev, [tierNum]: "error" }));
      setSaveError((prev) => ({ ...prev, [tierNum]: result.error || "Unknown error" }));
      setTimeout(() => setSaveStatus((prev) => ({ ...prev, [tierNum]: "idle" })), 6000);
    }
  };

  const handleAddCoin = (tierNum: number, coin: string) => {
    autoTrader.assignCoin(coin, tierNum);
    setAddCoinTier(null);
  };

  const handleRemoveCoin = (coin: string) => {
    autoTrader.unassignCoin(coin);
  };

  const handleSyncTrades = async () => {
    setSyncStatus("Syncing...");
    resetAdminAuthDenied(); // Reset denied state so auth retries if previously denied
    const result = await syncSwyftxTradesToDB(adminWallet);
    if (result) {
      if (result.error) {
        setSyncStatus(`Sync failed: ${result.error}`);
      } else {
        setSyncStatus(`Synced: ${result.imported} new, ${result.skipped} existing`);
        // Refresh trade log from Swyftx
        fetchSwyftxOrderHistory(50).then(setSwyftxTrades).catch(() => {});
      }
    } else {
      setSyncStatus("Sync failed");
    }
    setTimeout(() => setSyncStatus(null), 4000);
  };

  const formatPrice = (n: number) => {
    if (!n || isNaN(n)) return "$0.00";
    if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (n >= 1) return `$${n.toFixed(2)}`;
    return `$${n.toFixed(4)}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/[0.06] bg-[#0f172a]/60 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06] space-y-2">
        {/* Row 1: Title + close */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[10px] flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <span className="text-base font-bold text-slate-200">Auto Trade</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <FaTimes size={12} className="text-slate-400" />
          </button>
        </div>
        {/* Row 2: Status badges + stop button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-xl"
              style={{
                background: botActive ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                color: botActive ? "#22c55e" : "#ef4444",
              }}
            >
              {botActive ? "ACTIVE" : "INACTIVE"}
            </span>
            {botActive && snapshot.isOwner && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-lg bg-blue-500/15 text-blue-400">
                OWNER
              </span>
            )}
          </div>
          <button
            onClick={botActive ? () => autoTrader.stopAll() : undefined}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
            style={{
              background: botActive ? "rgba(239,68,68,0.15)" : "rgba(100,116,139,0.15)",
              border: `1px solid ${botActive ? "rgba(239,68,68,0.3)" : "rgba(100,116,139,0.3)"}`,
              color: botActive ? "#ef4444" : "#64748b",
            }}
          >
            {botActive ? <><FaStop size={8} /> Stop All</> : "No tiers active"}
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Error banner */}
        {tierError && (
          <div className="text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
            {tierError}
          </div>
        )}

        {/* ── Tier Cards — horizontal scroll ── */}
        <div
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x"
          style={{ scrollbarWidth: "none" }}
        >
          {tiers.map((tier) => {
            const availableToAdd = AVAILABLE_COINS.filter(
              (c) => !assignedCoins.has(c)
            );
            const hasCooldowns = tier.coins.some((coin) => autoTrader._isOnCooldown(coin));

            return (
              <div
                key={tier.num}
                className="flex-shrink-0 rounded-xl p-4 snap-start"
                style={{
                  background: `${tier.cfg.color}10`,
                  border: `1px solid ${tier.cfg.color}25`,
                  width: "min(300px, 85vw)",
                }}
              >
                {/* Tier title + targets + ACTIVE badge */}
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[14px] font-bold" style={{ color: tier.cfg.color }}>
                      T{tier.num} – {tier.cfg.name}
                    </span>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {tier.settings.deviation}% dev · {tier.settings.allocation}% alloc
                    </div>
                  </div>
                  <span
                    className="text-[9px] font-bold px-2 py-0.5 rounded-lg"
                    style={{
                      background: tier.active ? "rgba(34,197,94,0.15)" : "rgba(100,116,139,0.15)",
                      color: tier.active ? "#22c55e" : "#64748b",
                    }}
                  >
                    {tier.active ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                {/* Coin tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tier.coins.map((coin: string) => {
                    const cfg = ASSET_CONFIG[coin] || { color: "#64748b" };
                    const cd = autoTrader._isOnCooldown(coin);
                    return (
                      <span
                        key={coin}
                        className="text-[11px] font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1.5"
                        style={{
                          background: cfg.color + "20",
                          border: `1px solid ${cfg.color}40`,
                          color: cfg.color,
                          opacity: cd ? 0.5 : 1,
                        }}
                      >
                        {coin}{cd ? " (cd)" : ""}
                        <button
                          onClick={() => handleRemoveCoin(coin)}
                          className="hover:opacity-100 transition-opacity"
                          style={{ color: "#ef4444" }}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  <button
                    onClick={() => setAddCoinTier(addCoinTier === tier.num ? null : tier.num)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#64748b",
                    }}
                  >
                    <FaPlus size={9} />
                  </button>
                </div>

                {/* Add coin picker */}
                {addCoinTier === tier.num && availableToAdd.length > 0 && (
                  <div
                    className="flex flex-wrap gap-1 mb-3 p-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {availableToAdd.map((coin) => {
                      const cfg = ASSET_CONFIG[coin] || { color: "#64748b" };
                      return (
                        <button
                          key={coin}
                          onClick={() => handleAddCoin(tier.num, coin)}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded transition-all hover:scale-105"
                          style={{
                            background: cfg.color + "15",
                            border: `1px solid ${cfg.color}30`,
                            color: cfg.color,
                          }}
                        >
                          {coin}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Dev + Alloc sliders */}
                <div className="mb-3 space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Deviation</span>
                      <span className="text-[10px] font-bold text-blue-400">{tier.settings.deviation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.5"
                      value={tier.settings.deviation}
                      onChange={(e) => handleUpdateDeviation(tier.num, parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, #3b82f6 ${((tier.settings.deviation - 0.5) / 9.5) * 100}%, rgba(255,255,255,0.1) ${((tier.settings.deviation - 0.5) / 9.5) * 100}%)` }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-500">Allocation</span>
                      <span className="text-[10px] font-bold text-green-400">{tier.settings.allocation}%</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={tier.settings.allocation}
                      onChange={(e) => handleUpdateAllocation(tier.num, parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                      style={{ background: `linear-gradient(to right, #22c55e ${((tier.settings.allocation - 1) / 19) * 100}%, rgba(255,255,255,0.1) ${((tier.settings.allocation - 1) / 19) * 100}%)` }}
                    />
                  </div>
                </div>

                {/* Save Settings button */}
                <div className="mb-3">
                  {(() => {
                    const status = saveStatus[tier.num] || "idle";
                    return (
                      <button
                        onClick={() => handleSaveSettings(tier.num)}
                        disabled={status === "saving"}
                        className="w-full py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        style={{
                          background: status === "saved" ? "rgba(34,197,94,0.2)" :
                                      status === "error" ? "rgba(239,68,68,0.2)" :
                                      status === "saving" ? "rgba(59,130,246,0.15)" :
                                      "rgba(59,130,246,0.2)",
                          border: `1px solid ${
                            status === "saved" ? "rgba(34,197,94,0.4)" :
                            status === "error" ? "rgba(239,68,68,0.4)" :
                            "rgba(59,130,246,0.4)"
                          }`,
                          color: status === "saved" ? "#22c55e" :
                                 status === "error" ? "#ef4444" :
                                 "#3b82f6",
                        }}
                      >
                        {status === "saving" ? (
                          <>Saving...</>
                        ) : status === "saved" ? (
                          <><FaCheck size={10} /> Saved to DB</>
                        ) : status === "error" ? (
                          <>Failed: {saveError[tier.num] || "Unknown"} — Tap to Retry</>
                        ) : (
                          <><FaSave size={10} /> Save Settings</>
                        )}
                      </button>
                    );
                  })()}
                </div>

                {/* Start / Stop / Override buttons */}
                <div className="flex gap-2">
                  {!tier.active ? (
                    <button
                      onClick={() => handleStartTier(tier.num)}
                      disabled={startingTier === tier.num}
                      className="w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center"
                      style={{ background: startingTier === tier.num ? "#64748b" : "#22c55e", color: "#fff" }}
                    >
                      {startingTier === tier.num ? "Starting..." : "Start"}
                    </button>
                  ) : hasCooldowns ? (
                    <>
                      <button
                        onClick={() => handleStopTier(tier.num)}
                        className="flex-[3] py-2.5 rounded-xl text-xs font-bold transition-all text-center"
                        style={{ background: "#ef4444", color: "#fff" }}
                      >
                        Stop
                      </button>
                      <button
                        onClick={() => handleOverrideCooldowns(tier.num)}
                        className="flex-[2] py-2.5 rounded-xl text-xs font-bold transition-all text-center"
                        style={{
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.3)",
                          color: "#ef4444",
                        }}
                      >
                        Override
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleStopTier(tier.num)}
                      className="w-full py-2.5 rounded-xl text-xs font-bold transition-all text-center"
                      style={{ background: "#ef4444", color: "#fff" }}
                    >
                      Stop
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Monitoring header ── */}
        <div className="rounded-lg p-2 flex items-center justify-between" style={{ background: "rgba(168,85,247,0.1)" }}>
          <span className="text-[10px] font-bold text-slate-300">
            Monitoring {monitoringCount} coins
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {countdown}s
          </span>
        </div>

        {/* ── Coin monitoring grouped by tier ── */}
        {monitoringCount === 0 ? (
          <div className="text-[10px] text-slate-500 text-center py-4">
            No active tiers. Start a tier above to begin monitoring.
          </div>
        ) : Object.entries(grouped).map(([tierKey, coins]) => {
          const tierNum = Number(tierKey);
          const tierCfg = TIER_CONFIG[tierNum];

          return (
            <div key={tierKey}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: tierCfg.color }}>
                  T{tierNum} – {tierCfg.name}
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-slate-500">
                    Dev <span className="font-bold text-blue-400">{snapshot.tierSettings[`tier${tierNum}`]?.deviation ?? 0}%</span>
                  </span>
                  <span className="text-slate-500">
                    Alloc <span className="font-bold text-green-400">{snapshot.tierSettings[`tier${tierNum}`]?.allocation ?? 0}%</span>
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                {coins.map((item: any) => {
                  const cfg = ASSET_CONFIG[item.coin] || { color: "#64748b", icon: item.coin.charAt(0) };
                  const changeColor = item.change24h > 0 ? "#22c55e" : item.change24h < 0 ? "#ef4444" : "#64748b";
                  const recentTrade: RecentTrade | null = item.recentTrade;
                  const justTraded = !!recentTrade;
                  const tradeAge = recentTrade ? (Date.now() - recentTrade.time) / 1000 : 999;

                  // Calculate distance to each trigger as a percentage of current price
                  const pctToBuy = item.currentPrice > 0 && item.buyTrigger > 0
                    ? ((item.currentPrice - item.buyTrigger) / item.currentPrice) * 100
                    : 100;
                  const pctToSell = item.currentPrice > 0 && item.sellTrigger > 0
                    ? ((item.sellTrigger - item.currentPrice) / item.currentPrice) * 100
                    : 100;
                  const nearestSide: "buy" | "sell" = pctToBuy <= pctToSell ? "buy" : "sell";
                  const nearestPct = Math.max(0, nearestSide === "buy" ? pctToBuy : pctToSell);

                  // Calculate progress toward buy or sell trigger
                  let progress = 0;
                  if (item.hasTarget && item.currentPrice > 0) {
                    const mid = (item.buyTrigger + item.sellTrigger) / 2;
                    const halfRange = (item.sellTrigger - item.buyTrigger) / 2;
                    if (halfRange > 0) {
                      if (item.currentPrice < mid) {
                        progress = (mid - item.currentPrice) / halfRange;
                      } else {
                        progress = (item.currentPrice - mid) / halfRange;
                      }
                    }
                  }
                  progress = Math.max(0, Math.min(1, progress));

                  // Proximity thresholds for visual emphasis
                  const isNear = progress >= 0.65;
                  const isHot = progress >= 0.85;
                  const isCritical = progress >= 0.95;

                  // Bi-directional bar: green left (buy), red right (sell)
                  let direction = 0;
                  if (item.currentPrice > 0 && item.buyTrigger > 0 && item.sellTrigger > 0) {
                    const mid = (item.buyTrigger + item.sellTrigger) / 2;
                    direction = item.currentPrice >= mid ? 1 : -1;
                  }
                  const barColorBuy = isCritical ? "#22c55e" : isHot ? "#4ade80" : isNear ? "#86efac" : "#22c55e";
                  const barColorSell = isCritical ? "#ef4444" : isHot ? "#f97316" : isNear ? "#eab308" : "#ef4444";

                  // Estimated trade amounts
                  const estBuyAmount = autoTrader.getEstimatedBuyAmount(item.coin);
                  const estSellValue = autoTrader.getEstimatedSellValue(item.coin);
                  const estAmount = nearestSide === "buy" ? estBuyAmount : estSellValue;

                  // Celebration colors for just-traded coins
                  const celebBuy = recentTrade?.side === "BUY";
                  const celebColor = celebBuy ? "34,197,94" : "239,68,68"; // green or red

                  return (
                    <div
                      key={item.coin}
                      className={`rounded-lg p-2.5 transition-all duration-500${justTraded && tradeAge < 10 ? " animate-pulse" : ""}`}
                      style={{
                        background: justTraded
                          ? `rgba(${celebColor},${tradeAge < 5 ? 0.18 : 0.1})`
                          : item.inCooldown
                            ? "rgba(234,179,8,0.05)"
                            : isCritical && item.hasTarget
                              ? nearestSide === "buy" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)"
                              : isHot && item.hasTarget
                                ? "rgba(249,115,22,0.06)"
                                : "rgba(255,255,255,0.02)",
                        border: `1px solid ${
                          justTraded
                            ? `rgba(${celebColor},0.5)`
                            : item.inCooldown
                              ? "rgba(234,179,8,0.2)"
                              : isCritical && item.hasTarget
                                ? nearestSide === "buy" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"
                                : isHot && item.hasTarget
                                  ? "rgba(249,115,22,0.3)"
                                  : "rgba(255,255,255,0.04)"
                        }`,
                        boxShadow: justTraded
                          ? `0 0 20px rgba(${celebColor},0.25), inset 0 0 16px rgba(${celebColor},0.08)`
                          : isCritical && item.hasTarget && !item.inCooldown
                            ? nearestSide === "buy"
                              ? "0 0 12px rgba(34,197,94,0.15), inset 0 0 12px rgba(34,197,94,0.05)"
                              : "0 0 12px rgba(239,68,68,0.15), inset 0 0 12px rgba(239,68,68,0.05)"
                            : isHot && item.hasTarget && !item.inCooldown
                              ? "0 0 8px rgba(249,115,22,0.1)"
                              : "none",
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: cfg.color }}>
                            {item.coin}
                          </span>
                          {/* Celebration badge — takes priority over all other badges */}
                          {justTraded ? (
                            <span
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse"
                              style={{
                                background: `rgba(${celebColor},0.3)`,
                                color: celebBuy ? "#22c55e" : "#ef4444",
                                border: `1px solid rgba(${celebColor},0.5)`,
                              }}
                            >
                              {celebBuy ? "BOUGHT!" : "SOLD!"}
                            </span>
                          ) : item.inCooldown ? (
                            <span className="text-[9px] text-yellow-500">
                              (cd {autoTrader.getCooldownRemaining(item.coin)})
                            </span>
                          ) : item.hasTarget && isNear ? (
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
                          ) : item.hasTarget ? (
                            <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                              LIVE
                            </span>
                          ) : null}
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

                      <div className="flex justify-between text-[10px] font-mono">
                        <span className={pctToBuy <= pctToSell && item.hasTarget ? "text-green-400 font-bold" : "text-green-400/70"}>
                          Buy &lt; {formatPrice(item.buyTrigger)}
                        </span>
                        <span className="text-slate-300 font-bold">{formatPrice(item.currentPrice)}</span>
                        <span className={pctToSell < pctToBuy && item.hasTarget ? "text-red-400 font-bold" : "text-red-400/70"}>
                          Sell &gt; {formatPrice(item.sellTrigger)}
                        </span>
                      </div>

                      {/* Trade execution details (celebration) or proximity info */}
                      {justTraded && recentTrade ? (
                        <div className="flex justify-between items-center mt-1.5 pt-1.5" style={{ borderTop: `1px solid rgba(${celebColor},0.15)` }}>
                          <span className="text-[9px] font-bold font-mono" style={{ color: celebBuy ? "#22c55e" : "#ef4444" }}>
                            {celebBuy ? "Bought" : "Sold"} @ {formatPrice(recentTrade.price)}
                          </span>
                          <span className="text-[9px] font-bold font-mono" style={{ color: celebBuy ? "#22c55e" : "#ef4444" }}>
                            {formatPrice(recentTrade.amount)} {celebBuy ? "USDC" : "value"}
                          </span>
                        </div>
                      ) : item.hasTarget && !item.inCooldown ? (
                        <div className="flex justify-between items-center mt-1.5 pt-1.5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <span className="text-[9px] font-mono" style={{
                            color: isCritical ? (nearestSide === "buy" ? "#22c55e" : "#ef4444")
                              : isHot ? "#f97316"
                              : "#64748b",
                          }}>
                            {nearestPct.toFixed(1)}% to {nearestSide}
                          </span>
                          {estAmount > 0 && (
                            <span className="text-[9px] font-mono" style={{
                              color: isCritical ? (nearestSide === "buy" ? "#22c55e" : "#ef4444")
                                : isHot ? "#f97316"
                                : "#64748b",
                            }}>
                              ~{formatPrice(estAmount)} {nearestSide === "buy" ? "USDC" : "value"}
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* ── Trade Log ── */}
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(59,130,246,0.15)" }}>
          <div className="px-2.5 py-1.5 flex items-center justify-between" style={{ background: "rgba(59,130,246,0.08)" }}>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold" style={{ color: "#3b82f6" }}>Trade Log</span>
              {tradeLog.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>
                    {buyCount} Buy{buyCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                    {sellCount} Sell{sellCount !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {tradeLog.length > 0 && tradeLog[0].time && (
                <span className="text-[9px] text-slate-500 font-mono">
                  {new Date(tradeLog[0].time).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })}{" "}
                  {new Date(tradeLog[0].time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true })}
                </span>
              )}
              <button
                onClick={handleSyncTrades}
                className="text-[9px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                style={{ color: "#3b82f6", background: "rgba(59,130,246,0.1)" }}
              >
                <FaSync size={7} /> Sync
              </button>
            </div>
          </div>
          {syncStatus && (
            <div className="px-2.5 py-1 text-[9px] font-bold text-center" style={{ background: "rgba(59,130,246,0.05)", color: "#3b82f6" }}>
              {syncStatus}
            </div>
          )}
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {tradeLog.length === 0 ? (
              <div className="text-[10px] text-slate-500 text-center py-3">
                No auto-trades yet. Trades will appear here when triggered.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {tradeLog.slice(0, 20).map((entry, i) => {
                  const isSell = entry.side === "SELL";
                  const total = entry.amount;
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
                          {entry.side}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 font-mono">
                          {entry.quantity.toFixed(4)} @ {formatPrice(entry.price)}
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
        {tiers.every((t) => t.coins.length === 0) && monitoringCount === 0 && tradeLog.length === 0 && (
          <div className="text-center py-8 text-slate-500 text-xs">
            No coins assigned to any tier. Add coins to tiers above to get started.
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AdminAutoTradeView;
