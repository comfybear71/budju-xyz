import { useState, useEffect, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";
import { TOKEN_ADDRESS, DEXSCREENER_LINK } from "@constants/addresses";
import { FaExternalLinkAlt } from "react-icons/fa";

interface PairData {
  priceUsd: string;
  priceNative: string;
  priceChange: { h1: number; h6: number; h24: number };
  volume: { h1: number; h6: number; h24: number };
  txns: {
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  liquidity: { usd: number; base: number; quote: number };
  fdv: number;
  pairCreatedAt: number;
}

const formatSmallPrice = (price: string): string => {
  const num = parseFloat(price);
  if (num >= 0.01) return `$${num.toFixed(4)}`;
  if (num <= 0) return "$0.00";

  const str = num.toFixed(12);
  const [, decimal] = str.split(".");
  let leadingZeros = 0;
  for (const ch of decimal) {
    if (ch === "0") leadingZeros++;
    else break;
  }

  const subscripts = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087\u2088\u2089";
  const sub = String(leadingZeros)
    .split("")
    .map((d) => subscripts[parseInt(d)])
    .join("");
  const sig = decimal.slice(leadingZeros, leadingZeros + 4);
  return `$0.0${sub}${sig}`;
};

const formatVolume = (vol: number): string => {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(2)}`;
};

const RecentTrades: React.FC = () => {
  const { isDarkMode } = useTheme();
  const [data, setData] = useState<PairData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${TOKEN_ADDRESS}`,
        { headers: { accept: "application/json" } },
      );

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const json = await response.json();
      const pair = json?.pairs?.[0];

      if (pair) {
        setData({
          priceUsd: pair.priceUsd || "0",
          priceNative: pair.priceNative || "0",
          priceChange: pair.priceChange || { h1: 0, h6: 0, h24: 0 },
          volume: pair.volume || { h1: 0, h6: 0, h24: 0 },
          txns: pair.txns || {
            h1: { buys: 0, sells: 0 },
            h6: { buys: 0, sells: 0 },
            h24: { buys: 0, sells: 0 },
          },
          liquidity: pair.liquidity || { usd: 0, base: 0, quote: 0 },
          fdv: pair.fdv || 0,
          pairCreatedAt: pair.pairCreatedAt || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching market data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const labelClass = `text-[10px] font-bold uppercase tracking-wider ${
    isDarkMode ? "text-gray-500" : "text-white/50"
  }`;
  const valueClass = `text-sm font-mono font-bold ${
    isDarkMode ? "text-white" : "text-white"
  }`;
  const cardBg = isDarkMode
    ? "bg-white/[0.03] border border-white/[0.06]"
    : "bg-white/10 border border-white/20";

  const changeColor = (val: number) =>
    val > 0 ? "text-emerald-400" : val < 0 ? "text-red-400" : isDarkMode ? "text-gray-400" : "text-white/60";

  return (
    <div
      className={`rounded-lg overflow-hidden ${
        isDarkMode
          ? "bg-gray-900/80 backdrop-blur-sm"
          : "bg-white/20 backdrop-blur-sm border border-white/30"
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <h3 className={labelClass}>Market Activity</h3>
        <a
          href={DEXSCREENER_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition-colors ${
            isDarkMode
              ? "text-cyan-400/60 hover:text-cyan-400 hover:bg-white/5"
              : "text-white/60 hover:text-white hover:bg-white/10"
          }`}
        >
          DexScreener <FaExternalLinkAlt className="w-2.5 h-2.5" />
        </a>
      </div>

      {loading || !data ? (
        <div
          className={`px-4 py-8 text-center text-xs ${
            isDarkMode ? "text-gray-500" : "text-white/50"
          }`}
        >
          Loading market data...
        </div>
      ) : (
        <div className="px-4 pb-4 space-y-3">
          {/* Price + FDV row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>Price</div>
              <div className={valueClass}>{formatSmallPrice(data.priceUsd)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>FDV</div>
              <div className={valueClass}>{formatVolume(data.fdv)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>Liquidity</div>
              <div className={valueClass}>{formatVolume(data.liquidity.usd)}</div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>24h Volume</div>
              <div className={valueClass}>{formatVolume(data.volume.h24)}</div>
            </div>
          </div>

          {/* Price changes */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>1h Change</div>
              <div className={`text-sm font-mono font-bold ${changeColor(data.priceChange.h1)}`}>
                {data.priceChange.h1 > 0 ? "+" : ""}
                {data.priceChange.h1?.toFixed(2) || "0.00"}%
              </div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>6h Change</div>
              <div className={`text-sm font-mono font-bold ${changeColor(data.priceChange.h6)}`}>
                {data.priceChange.h6 > 0 ? "+" : ""}
                {data.priceChange.h6?.toFixed(2) || "0.00"}%
              </div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>24h Change</div>
              <div className={`text-sm font-mono font-bold ${changeColor(data.priceChange.h24)}`}>
                {data.priceChange.h24 > 0 ? "+" : ""}
                {data.priceChange.h24?.toFixed(2) || "0.00"}%
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>1h Txns</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-400">
                  {data.txns.h1.buys}B
                </span>
                <span className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-white/30"}`}>/</span>
                <span className="text-xs font-mono text-red-400">
                  {data.txns.h1.sells}S
                </span>
              </div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>6h Txns</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-400">
                  {data.txns.h6.buys}B
                </span>
                <span className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-white/30"}`}>/</span>
                <span className="text-xs font-mono text-red-400">
                  {data.txns.h6.sells}S
                </span>
              </div>
            </div>
            <div className={`rounded-lg px-3 py-2.5 ${cardBg}`}>
              <div className={labelClass}>24h Txns</div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-emerald-400">
                  {data.txns.h24.buys}B
                </span>
                <span className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-white/30"}`}>/</span>
                <span className="text-xs font-mono text-red-400">
                  {data.txns.h24.sells}S
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecentTrades;
