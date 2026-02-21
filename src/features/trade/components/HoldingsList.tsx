import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FaSortAmountDown,
  FaChevronUp,
  FaChevronDown,
  FaChartLine,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import type { PortfolioAsset } from "../services/tradeApi";

type SortType = "value" | "change" | "name" | "balance";

interface Props {
  assets: PortfolioAsset[];
  prices: Record<string, number>;
  onSelectAsset?: (code: string) => void;
  selectedAsset?: string;
  isAdmin?: boolean;
  userAllocation?: number;
  viewMode: "mine" | "pool";
  onToggleView?: (view: "mine" | "pool") => void;
}

const HoldingsList = ({
  assets,
  prices,
  onSelectAsset,
  selectedAsset,
  isAdmin,
  userAllocation = 0,
  viewMode,
  onToggleView,
}: Props) => {
  const { isDarkMode } = useTheme();
  const [sortType, setSortType] = useState<SortType>("value");
  const [showSort, setShowSort] = useState(false);

  const sortedAssets = useMemo(() => {
    const items = [...assets].map((a) => ({
      ...a,
      priceUsd: prices[a.code] || a.priceUsd || 0,
      displayValue:
        viewMode === "mine" && userAllocation > 0
          ? a.usdValue * (userAllocation / 100)
          : a.usdValue,
    }));

    switch (sortType) {
      case "value":
        return items.sort((a, b) => b.displayValue - a.displayValue);
      case "change":
        return items.sort(
          (a, b) => Math.abs(b.change24h) - Math.abs(a.change24h),
        );
      case "name":
        return items.sort((a, b) => a.code.localeCompare(b.code));
      case "balance":
        return items.sort((a, b) => b.balance - a.balance);
      default:
        return items;
    }
  }, [assets, prices, sortType, viewMode, userAllocation]);

  const totalValue = sortedAssets.reduce((s, a) => s + a.displayValue, 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3
            className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Holdings
          </h3>
          {/* View toggle for users */}
          {!isAdmin && onToggleView && (
            <div
              className={`flex rounded-lg border overflow-hidden text-[10px] ${isDarkMode ? "border-white/[0.08]" : "border-gray-200"}`}
            >
              <button
                onClick={() => onToggleView("mine")}
                className={`px-2 py-1 font-bold transition-colors ${
                  viewMode === "mine"
                    ? "bg-budju-pink/20 text-budju-pink"
                    : isDarkMode
                      ? "text-gray-500"
                      : "text-gray-400"
                }`}
              >
                Mine
              </button>
              <button
                onClick={() => onToggleView("pool")}
                className={`px-2 py-1 font-bold transition-colors ${
                  viewMode === "pool"
                    ? "bg-budju-blue/20 text-budju-blue"
                    : isDarkMode
                      ? "text-gray-500"
                      : "text-gray-400"
                }`}
              >
                Pool
              </button>
            </div>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <button
            onClick={() => setShowSort(!showSort)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${isDarkMode ? "text-gray-500 hover:text-white hover:bg-white/10" : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"}`}
          >
            <FaSortAmountDown size={10} />
            {sortType === "value"
              ? "Value"
              : sortType === "change"
                ? "24h %"
                : sortType === "name"
                  ? "Name"
                  : "Balance"}
          </button>
          <AnimatePresence>
            {showSort && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={`absolute right-0 top-full mt-1 z-20 rounded-lg border shadow-lg ${isDarkMode ? "bg-[#0c0c20] border-white/[0.08]" : "bg-white border-gray-200"}`}
              >
                {(
                  [
                    ["value", "Value"],
                    ["change", "24h %"],
                    ["name", "Name"],
                    ["balance", "Balance"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSortType(key);
                      setShowSort(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-xs transition-colors ${
                      sortType === key
                        ? "text-budju-pink font-bold"
                        : isDarkMode
                          ? "text-gray-400 hover:text-white hover:bg-white/5"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Asset list */}
      <div className="space-y-2">
        {sortedAssets.length === 0 && (
          <div
            className={`text-center py-8 text-sm ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
          >
            No crypto holdings yet
          </div>
        )}
        {sortedAssets.map((asset) => {
          const isSelected = selectedAsset === asset.code;
          const isUp = asset.change24h >= 0;

          return (
            <motion.div
              key={asset.code}
              layout
              onClick={() => onSelectAsset?.(asset.code)}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? isDarkMode
                    ? "bg-budju-blue/10 border-budju-blue/30"
                    : "bg-blue-50 border-blue-200"
                  : isDarkMode
                    ? "bg-[#0c0c20]/40 border-white/[0.04] hover:border-white/[0.1]"
                    : "bg-white/40 border-gray-200/30 hover:border-gray-300/50"
              }`}
            >
              {/* Color dot */}
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ backgroundColor: asset.color }}
              >
                {asset.code.slice(0, 2)}
              </div>

              {/* Name & balance */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {asset.code}
                  </span>
                  <span
                    className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    {asset.name}
                  </span>
                </div>
                <div
                  className={`text-xs font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  {asset.balance.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                </div>
              </div>

              {/* Price & change */}
              <div className="text-right flex-shrink-0">
                <div
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  $
                  {asset.displayValue.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </div>
                <div
                  className={`flex items-center justify-end gap-0.5 text-xs font-mono ${isUp ? "text-green-400" : "text-red-400"}`}
                >
                  {isUp ? (
                    <FaChevronUp size={8} />
                  ) : (
                    <FaChevronDown size={8} />
                  )}
                  {Math.abs(asset.change24h).toFixed(1)}%
                </div>
              </div>

              {/* Allocation bar */}
              <div className="w-12 flex-shrink-0">
                <div
                  className={`h-1 rounded-full overflow-hidden ${isDarkMode ? "bg-white/[0.06]" : "bg-gray-200/60"}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width:
                        totalValue > 0
                          ? `${Math.min((asset.displayValue / totalValue) * 100, 100)}%`
                          : "0%",
                      backgroundColor: asset.color,
                    }}
                  />
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
