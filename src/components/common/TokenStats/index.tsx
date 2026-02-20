import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { createChart, ColorType, IChartApi } from "lightweight-charts";
import { FaExternalLinkAlt, FaChartLine, FaFire, FaUsers, FaCoins } from "react-icons/fa";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchHeliusTokenMetrics,
  getTokenBalances,
  HeliusTokenBalance,
  fetchHistoricalPriceData,
  TOKEN_ADDRESS,
  BURN_ADDRESS,
} from "@/lib/utils/tokenService";
import { BURN_ADDRESS_ACCOUNT } from "@/constants/addresses";

interface TokenData {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  totalSupply: number;
  burned: number;
}

const TokenStats = () => {
  const { isDarkMode } = useTheme();
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topHolders, setTopHolders] = useState<
    { address: string; percentage: number }[]
  >([]);
  const [priceHistory, setPriceHistory] = useState<
    { time: string; value: number }[]
  >([]);

  const priceChartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);

  const SOLSCAN_TOKEN_LINK = `https://solscan.io/token/${TOKEN_ADDRESS}`;
  const SOLSCAN_BURN_LINK = `https://solscan.io/account/${BURN_ADDRESS_ACCOUNT}`;

  const fetchTokenData = async () => {
    try {
      setLoading(true);
      setError(null);
      const metrics = await fetchHeliusTokenMetrics();
      const tokenBalances: HeliusTokenBalance[] = await getTokenBalances();
      const sortedBalances = tokenBalances
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
      const totalTokens = tokenBalances.reduce(
        (sum, balance) => sum + balance.amount,
        0,
      );
      const topHoldersWithPercentage = sortedBalances.map((balance) => ({
        address: balance.owner,
        percentage: totalTokens > 0 ? (balance.amount / totalTokens) * 100 : 0,
      }));

      setTopHolders(topHoldersWithPercentage);
      setTokenData(metrics);
    } catch (err) {
      console.error("Error fetching token data:", err);
      setError("Failed to load token data");
      setTokenData(null);
      setTopHolders([
        { address: "ABC...XYZ", percentage: 15 },
        { address: "DEF...UVW", percentage: 10 },
        { address: "GHI...RST", percentage: 8 },
        { address: "JKL...MNO", percentage: 5 },
        { address: "PQR...STU", percentage: 3 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchHistoricalPriceData(TOKEN_ADDRESS, 30, "1D").then((data) => {
      setPriceHistory(data.map((d) => ({ time: d.date, value: d.price })));
    });
  }, []);

  useEffect(() => {
    if (!priceChartRef.current || priceHistory.length === 0) return;
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chart = createChart(priceChartRef.current, {
      width: priceChartRef.current.clientWidth,
      height: priceChartRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: isDarkMode
          ? "rgba(148,163,184,0.6)"
          : "rgba(100,116,139,0.6)",
      },
      grid: {
        vertLines: {
          color: isDarkMode
            ? "rgba(148,163,184,0.06)"
            : "rgba(100,116,139,0.08)",
        },
        horzLines: {
          color: isDarkMode
            ? "rgba(148,163,184,0.06)"
            : "rgba(100,116,139,0.08)",
        },
      },
      rightPriceScale: {
        borderColor: isDarkMode
          ? "rgba(148,163,184,0.1)"
          : "rgba(100,116,139,0.1)",
      },
      timeScale: {
        borderColor: isDarkMode
          ? "rgba(148,163,184,0.1)"
          : "rgba(100,116,139,0.1)",
        timeVisible: false,
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addAreaSeries({
      lineColor: "#06b6d4",
      topColor: isDarkMode ? "rgba(6,182,212,0.2)" : "rgba(6,182,212,0.15)",
      bottomColor: "rgba(6,182,212,0)",
      lineWidth: 2,
    });
    series.setData(priceHistory);
    chart.timeScale().fitContent();
    chartInstanceRef.current = chart;

    const handleResize = () => {
      if (priceChartRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: priceChartRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [priceHistory, isDarkMode]);

  const remainingSupply = tokenData
    ? tokenData.totalSupply - tokenData.burned
    : 0;

  const formatPrice = (p: number) => {
    if (p < 0.01) return `$${p.toFixed(8)}`;
    if (p < 1) return `$${p.toFixed(4)}`;
    return `$${p.toFixed(2)}`;
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  };

  const statCards = [
    {
      label: "BUDJU Price",
      value: loading
        ? "..."
        : tokenData
          ? formatPrice(tokenData.price)
          : "N/A",
      sub: loading ? "Loading..." : "Real-time",
      icon: FaChartLine,
      accent: "cyan",
    },
    {
      label: "Market Cap",
      value: loading
        ? "..."
        : tokenData
          ? formatNumber(tokenData.marketCap)
          : "N/A",
      sub: loading ? "Loading..." : "Fully diluted",
      icon: FaCoins,
      accent: "emerald",
    },
    {
      label: "Holders",
      value: loading
        ? "..."
        : tokenData
          ? tokenData.holders.toLocaleString()
          : "N/A",
      sub: loading ? "Loading..." : "Community members",
      icon: FaUsers,
      accent: "blue",
    },
    {
      label: "Circ. Supply",
      value: loading
        ? "..."
        : tokenData
          ? remainingSupply.toLocaleString()
          : "N/A",
      sub: loading
        ? "Loading..."
        : `${tokenData ? tokenData.burned.toLocaleString() : "0"} burned`,
      icon: FaFire,
      accent: "pink",
    },
  ];

  const accentColors: Record<string, { border: string; icon: string; glow: string }> = {
    cyan: {
      border: isDarkMode ? "border-cyan-500/20" : "border-cyan-500/15",
      icon: isDarkMode ? "text-cyan-400" : "text-cyan-600",
      glow: "rgba(6,182,212,0.08)",
    },
    emerald: {
      border: isDarkMode ? "border-emerald-500/20" : "border-emerald-500/15",
      icon: isDarkMode ? "text-emerald-400" : "text-emerald-600",
      glow: "rgba(16,185,129,0.08)",
    },
    blue: {
      border: isDarkMode ? "border-blue-500/20" : "border-blue-500/15",
      icon: isDarkMode ? "text-blue-400" : "text-blue-600",
      glow: "rgba(59,130,246,0.08)",
    },
    pink: {
      border: isDarkMode ? "border-budju-pink/20" : "border-budju-pink/15",
      icon: isDarkMode ? "text-budju-pink" : "text-budju-pink-dark",
      glow: "rgba(255,105,180,0.08)",
    },
  };

  return (
    <section className="py-8 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-display font-bold mb-2 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            Bot{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              Dashboard
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Live metrics from the BUDJU trading ecosystem
          </p>
        </motion.div>

        {error && (
          <div
            className={`text-center text-sm mb-6 ${
              isDarkMode ? "text-red-400/80" : "text-red-500/80"
            }`}
          >
            {error}
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {statCards.map((card, index) => {
            const colors = accentColors[card.accent];
            return (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className={`relative rounded-xl overflow-hidden border ${colors.border} ${
                  isDarkMode
                    ? "bg-[#0c0c20]/60"
                    : "bg-white/60"
                } backdrop-blur-sm p-4 md:p-5`}
                style={{
                  boxShadow: `0 0 30px ${colors.glow}`,
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <card.icon className={`w-3.5 h-3.5 ${colors.icon}`} />
                  <span
                    className={`text-[10px] uppercase tracking-widest font-semibold ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {card.label}
                  </span>
                </div>
                <p
                  className={`text-lg md:text-2xl font-bold font-mono tracking-tight ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {card.value}
                </p>
                <p
                  className={`text-[10px] mt-1.5 ${
                    isDarkMode ? "text-gray-600" : "text-gray-400"
                  }`}
                >
                  {card.sub}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Price Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={`mt-4 md:mt-6 rounded-xl border overflow-hidden ${
            isDarkMode
              ? "bg-[#0c0c20]/60 border-white/[0.06]"
              : "bg-white/60 border-gray-200/40"
          } backdrop-blur-sm`}
        >
          <div
            className={`flex items-center justify-between px-5 py-3 border-b ${
              isDarkMode ? "border-white/[0.06]" : "border-gray-200/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <FaChartLine
                className={`w-3 h-3 ${
                  isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                }`}
              />
              <span
                className={`text-xs font-semibold ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                BUDJU/USD — 30D
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500"></span>
              </span>
              <span
                className={`text-[10px] font-mono ${
                  isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                }`}
              >
                LIVE
              </span>
            </div>
          </div>
          <div ref={priceChartRef} className="w-full h-52 md:h-72 px-2" />
        </motion.div>

        {/* Top Holders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className={`mt-4 md:mt-6 rounded-xl border ${
            isDarkMode
              ? "bg-[#0c0c20]/60 border-white/[0.06]"
              : "bg-white/60 border-gray-200/40"
          } backdrop-blur-sm p-5`}
        >
          <h3
            className={`text-sm font-semibold mb-4 flex items-center gap-2 ${
              isDarkMode ? "text-gray-300" : "text-gray-700"
            }`}
          >
            <FaUsers
              className={`w-3 h-3 ${
                isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
              }`}
            />
            Top Holders
          </h3>
          <div className="space-y-2">
            {topHolders.map((holder, index) => (
              <div
                key={holder.address}
                className={`flex justify-between items-center py-2.5 px-3 rounded-lg ${
                  isDarkMode
                    ? "bg-white/[0.02] hover:bg-white/[0.04]"
                    : "bg-gray-50/60 hover:bg-gray-100/60"
                } transition-colors`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-mono w-5 ${
                      isDarkMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <code
                    className={`text-xs font-mono ${
                      isDarkMode ? "text-cyan-400/80" : "text-cyan-600/80"
                    }`}
                  >
                    {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                  </code>
                </div>
                <span
                  className={`text-xs font-mono font-semibold ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {holder.percentage.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contract Addresses */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className={`mt-4 md:mt-6 rounded-xl border ${
            isDarkMode
              ? "bg-[#0c0c20]/60 border-white/[0.06]"
              : "bg-white/60 border-gray-200/40"
          } backdrop-blur-sm p-5`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Token Address */}
            <div>
              <h3
                className={`text-xs uppercase tracking-widest font-semibold mb-2 flex items-center gap-2 ${
                  isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                }`}
              >
                Token Address
              </h3>
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                  isDarkMode
                    ? "bg-white/[0.03] border border-white/[0.04]"
                    : "bg-gray-50/60 border border-gray-200/40"
                }`}
              >
                <code
                  className={`text-[11px] font-mono truncate flex-1 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {TOKEN_ADDRESS}
                </code>
                <CopyToClipboard text={TOKEN_ADDRESS} />
                <a
                  href={SOLSCAN_TOKEN_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-1.5 rounded-md transition-colors ${
                    isDarkMode
                      ? "text-cyan-400/60 hover:text-cyan-400 hover:bg-white/[0.04]"
                      : "text-cyan-600/60 hover:text-cyan-600 hover:bg-gray-100"
                  }`}
                  aria-label="View on Solscan"
                >
                  <FaExternalLinkAlt size={12} />
                </a>
              </div>
            </div>

            {/* Burn Address */}
            <div>
              <h3
                className={`text-xs uppercase tracking-widest font-semibold mb-2 flex items-center gap-2 ${
                  isDarkMode ? "text-budju-pink/70" : "text-budju-pink-dark/70"
                }`}
              >
                Burn Address
              </h3>
              <div
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 ${
                  isDarkMode
                    ? "bg-white/[0.03] border border-white/[0.04]"
                    : "bg-gray-50/60 border border-gray-200/40"
                }`}
              >
                <code
                  className={`text-[11px] font-mono truncate flex-1 ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  {BURN_ADDRESS}
                </code>
                <CopyToClipboard text={BURN_ADDRESS} />
                <a
                  href={SOLSCAN_BURN_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-1.5 rounded-md transition-colors ${
                    isDarkMode
                      ? "text-budju-pink/60 hover:text-budju-pink hover:bg-white/[0.04]"
                      : "text-budju-pink-dark/60 hover:text-budju-pink-dark hover:bg-gray-100"
                  }`}
                  aria-label="View on Solscan"
                >
                  <FaExternalLinkAlt size={12} />
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TokenStats;
