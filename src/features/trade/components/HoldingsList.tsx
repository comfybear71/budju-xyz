import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
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

  const totalValue = assets.reduce((s, a) => s + a.usdValue, 0);

  const sorted = useMemo(() => {
    const arr = [...assets];
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
  }, [assets, sortKey, sortAsc]);

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
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-300">
          Holdings
          <span className="text-slate-600 font-normal ml-1.5">
            ({assets.length})
          </span>
        </h3>
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
                        {sortAsc ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Holdings Cards */}
      <div className="space-y-2">
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

          return (
            <motion.div
              key={asset.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.03 }}
              onClick={isAdmin ? () => onSelectAsset(asset.code) : undefined}
              className={`relative rounded-xl p-3.5 transition-all duration-200 border ${
                isAdmin
                  ? isSelected
                    ? "bg-blue-500/[0.08] border-blue-500/20 cursor-pointer"
                    : "bg-slate-800/30 border-transparent hover:bg-slate-800/50 hover:border-slate-700/30 cursor-pointer"
                  : "bg-slate-800/30 border-transparent"
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
                      <div className="text-sm font-bold text-white font-mono">
                        {formatUsd(asset.usdValue)}
                      </div>
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
                      <span className="text-[11px] font-bold font-mono">
                        {asset.change24h > 0 ? "+" : ""}
                        {asset.change24h.toFixed(1)}%
                      </span>
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
      </div>
    </div>
  );
};

export default HoldingsList;
