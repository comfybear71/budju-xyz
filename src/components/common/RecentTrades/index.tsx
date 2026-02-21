import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { POOL_SOL_BUDJU } from "@constants/addresses";

interface Trade {
  timestamp: string;
  type: "buy" | "sell";
  priceUsd: string;
  amountBase: string;
  amountQuote: string;
  txHash: string;
  maker: string;
}

interface RecentTradesProps {
  poolAddress?: string;
}

const RecentTrades: React.FC<RecentTradesProps> = ({
  poolAddress = POOL_SOL_BUDJU,
}) => {
  const { isDarkMode } = useTheme();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/trades`,
        { headers: { accept: "application/json" } },
      );

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();
      const rawTrades = json?.data;

      if (!Array.isArray(rawTrades)) return;

      const parsed: Trade[] = rawTrades.slice(0, 20).map((t: any) => {
        const attrs = t.attributes;
        return {
          timestamp: attrs.block_timestamp,
          type: attrs.kind === "buy" ? "buy" : "sell",
          priceUsd: attrs.price_to_in_usd || attrs.price_from_in_usd || "0",
          amountBase: attrs.from_token_amount || "0",
          amountQuote: attrs.to_token_amount || "0",
          txHash: attrs.tx_hash || "",
          maker: attrs.tx_from_address || "",
        };
      });

      setTrades(parsed);
    } catch (error) {
      console.error("Error fetching trades:", error);
    } finally {
      setLoading(false);
    }
  }, [poolAddress]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 30000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  };

  const formatNumber = (val: string, decimals = 2) => {
    const num = parseFloat(val);
    if (isNaN(num)) return "0";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toFixed(decimals);
  };

  const shortenAddr = (addr: string) => {
    if (!addr || addr.length < 8) return addr;
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  return (
    <div
      className={`rounded-lg overflow-hidden ${
        isDarkMode
          ? "bg-gray-900/80 backdrop-blur-sm"
          : "bg-white/20 backdrop-blur-sm border border-white/30"
      }`}
    >
      <div className="px-4 py-3 flex items-center justify-between">
        <h3
          className={`text-xs font-bold uppercase tracking-widest ${
            isDarkMode ? "text-gray-400" : "text-white/80"
          }`}
        >
          Recent Trades
        </h3>
        <button
          onClick={() => {
            setLoading(true);
            fetchTrades();
          }}
          className={`text-[10px] px-2 py-1 rounded transition-colors cursor-pointer ${
            isDarkMode
              ? "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          Refresh
        </button>
      </div>

      {/* Table header */}
      <div
        className={`grid grid-cols-5 gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider ${
          isDarkMode
            ? "text-gray-500 border-t border-white/[0.06]"
            : "text-white/50 border-t border-white/20"
        }`}
      >
        <span>Time</span>
        <span>Type</span>
        <span className="text-right">Price</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Maker</span>
      </div>

      {/* Trade rows */}
      <div className="max-h-[280px] sm:max-h-[320px] overflow-y-auto">
        {loading ? (
          <div
            className={`px-4 py-8 text-center text-xs ${
              isDarkMode ? "text-gray-500" : "text-white/50"
            }`}
          >
            Loading trades...
          </div>
        ) : trades.length === 0 ? (
          <div
            className={`px-4 py-8 text-center text-xs ${
              isDarkMode ? "text-gray-500" : "text-white/50"
            }`}
          >
            No recent trades found
          </div>
        ) : (
          trades.map((trade, i) => (
            <a
              key={`${trade.txHash}-${i}`}
              href={`https://solscan.io/tx/${trade.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`grid grid-cols-5 gap-2 px-4 py-2 text-xs transition-colors ${
                isDarkMode ? "hover:bg-white/[0.03]" : "hover:bg-white/10"
              } ${
                isDarkMode
                  ? i % 2 === 0
                    ? "bg-transparent"
                    : "bg-white/[0.01]"
                  : i % 2 === 0
                    ? "bg-transparent"
                    : "bg-white/5"
              }`}
            >
              <span
                className={
                  isDarkMode ? "text-gray-400" : "text-white/70"
                }
              >
                {formatTime(trade.timestamp)}
              </span>
              <span
                className={`font-bold ${
                  trade.type === "buy" ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {trade.type === "buy" ? "BUY" : "SELL"}
              </span>
              <span
                className={`text-right font-mono ${
                  isDarkMode ? "text-gray-300" : "text-white/90"
                }`}
              >
                ${formatNumber(trade.priceUsd, 6)}
              </span>
              <span
                className={`text-right font-mono ${
                  isDarkMode ? "text-gray-300" : "text-white/90"
                }`}
              >
                {formatNumber(trade.amountBase)}
              </span>
              <span
                className={`text-right font-mono ${
                  isDarkMode ? "text-gray-500" : "text-white/50"
                }`}
              >
                {shortenAddr(trade.maker)}
              </span>
            </a>
          ))
        )}
      </div>
    </div>
  );
};

export default RecentTrades;
