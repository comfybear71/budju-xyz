import { useState, useMemo } from "react";
import { motion } from "motion/react";
import { FaArrowUp, FaArrowDown, FaSearch } from "react-icons/fa";
import type { SpotAsset } from "../services/spotApi";

interface SpotPriceListProps {
  assets: SpotAsset[];
  onSelect: (symbol: string) => void;
  selectedSymbol: string;
}

export default function SpotPriceList({ assets, onSelect, selectedSymbol }: SpotPriceListProps) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"symbol" | "price" | "change">("symbol");

  const filtered = useMemo(() => {
    let list = assets.filter((a) =>
      a.symbol.toLowerCase().includes(search.toLowerCase())
    );
    list.sort((a, b) => {
      if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol);
      if (sortBy === "price") return (b.price ?? 0) - (a.price ?? 0);
      return (b.change_pct ?? 0) - (a.change_pct ?? 0);
    });
    return list;
  }, [assets, search, sortBy]);

  return (
    <div className="bg-black/30 rounded-budju border border-white/10 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm" />
          <input
            type="text"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-budju-blue/50"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-sm text-white focus:outline-none"
        >
          <option value="symbol">Name</option>
          <option value="price">Price</option>
          <option value="change">Change</option>
        </select>
      </div>

      <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
        {filtered.map((asset) => (
          <motion.button
            key={asset.symbol}
            onClick={() => onSelect(asset.symbol)}
            whileTap={{ scale: 0.98 }}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left ${
              selectedSymbol === asset.symbol
                ? "bg-budju-blue/20 border border-budju-blue/30"
                : "hover:bg-white/5 border border-transparent"
            }`}
          >
            <div>
              <span className="font-semibold text-white text-sm">{asset.symbol}</span>
            </div>
            <div className="text-right">
              <div className="text-sm text-white">
                {asset.price != null ? `$${asset.price < 0.01 ? asset.price.toFixed(6) : asset.price.toFixed(2)}` : "—"}
              </div>
              <div
                className={`text-xs flex items-center justify-end gap-1 ${
                  (asset.change_pct ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {(asset.change_pct ?? 0) >= 0 ? <FaArrowUp className="text-[10px]" /> : <FaArrowDown className="text-[10px]" />}
                {Math.abs(asset.change_pct ?? 0).toFixed(2)}%
              </div>
            </div>
          </motion.button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-white/40 text-sm py-4">No assets found</p>
        )}
      </div>
    </div>
  );
}
