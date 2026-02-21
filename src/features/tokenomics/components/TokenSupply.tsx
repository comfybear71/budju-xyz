import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FaChartPie } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import {
  fetchHeliusTokenMetrics,
  TOKEN_ADDRESS,
  BURN_ADDRESS,
} from "@/lib/utils/tokenService";

interface TokenAllocation {
  name: string;
  percentage: number;
  color: string;
  value: number;
}

const TokenSupply = () => {
  const { isDarkMode } = useTheme();
  const [tokenAllocation, setTokenAllocation] = useState<TokenAllocation[]>([]);
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [burnedTokens, setBurnedTokens] = useState<number>(0);
  const [raydiumVault, setRaydiumVault] = useState<number>(0);
  const [bankOfBudju, setBankOfBudju] = useState<number>(0);
  const [communityVault, setCommunityVault] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchTokenSupplyData = async () => {
    try {
      setLoading(true);
      const metrics = await fetchHeliusTokenMetrics(
        TOKEN_ADDRESS,
        BURN_ADDRESS,
      );

      const totalSupply = metrics.totalSupply;
      const burned = metrics.burned;
      const raydiumVault = metrics.raydiumVault;
      const bankOfBudju = metrics.bankOfBudju;
      const communityVault = metrics.communityVault;
      const circulatingSupply =
        totalSupply - burned - raydiumVault - bankOfBudju - communityVault;

      const realAllocation: TokenAllocation[] = [
        {
          name: "Circ. Supply",
          percentage: (circulatingSupply / totalSupply) * 100,
          color: "#06b6d4",
          value: circulatingSupply,
        },
        {
          name: "Burned Tokens",
          percentage: (burned / totalSupply) * 100,
          color: "#ef4444",
          value: burned,
        },
        {
          name: "Raydium Vault",
          percentage: (raydiumVault / totalSupply) * 100,
          color: "#10b981",
          value: raydiumVault,
        },
        {
          name: "Bank of BUDJU",
          percentage: (bankOfBudju / totalSupply) * 100,
          color: "#f59e0b",
          value: bankOfBudju,
        },
        {
          name: "Pool of BUDJU",
          percentage: (communityVault / totalSupply) * 100,
          color: "#ec4899",
          value: communityVault,
        },
      ].filter((item) => item.value > 0);

      setTokenAllocation(realAllocation);
      setTotalSupply(totalSupply);
      setBurnedTokens(burned);
      setRaydiumVault(raydiumVault);
      setBankOfBudju(bankOfBudju);
      setCommunityVault(communityVault);
    } catch (error) {
      console.error("Error fetching token supply data:", error);
      setTokenAllocation([
        {
          name: "Circ. Supply",
          percentage: 89.44,
          color: "#06b6d4",
          value: 894_400_000,
        },
        {
          name: "Burned Tokens",
          percentage: 1.56,
          color: "#ef4444",
          value: 15_600_000,
        },
        {
          name: "Raydium Vault",
          percentage: 8.94,
          color: "#10b981",
          value: 89_400_000,
        },
        {
          name: "Bank of BUDJU",
          percentage: 0.06,
          color: "#f59e0b",
          value: 600_000,
        },
        {
          name: "Pool of BUDJU",
          percentage: 0.06,
          color: "#ec4899",
          value: 600_000,
        },
      ]);
      setTotalSupply(1_000_000_000);
      setBurnedTokens(15_600_000);
      setRaydiumVault(89_400_000);
      setBankOfBudju(600_000);
      setCommunityVault(600_000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenSupplyData();
    const interval = setInterval(fetchTokenSupplyData, 300000);
    return () => clearInterval(interval);
  }, []);

  const remainingSupply =
    totalSupply - burnedTokens - raydiumVault - bankOfBudju - communityVault;

  // Build the donut chart as an SVG with stroke-dasharray arcs
  const renderDonutChart = () => {
    if (tokenAllocation.length === 0) return null;

    const size = 200;
    const strokeWidth = 32;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let cumulativeOffset = 0;

    return (
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full h-full max-w-[280px] mx-auto"
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}
          strokeWidth={strokeWidth}
        />
        {/* Segments */}
        {tokenAllocation.map((segment, index) => {
          const segmentLength = (segment.percentage / 100) * circumference;
          const offset = cumulativeOffset;
          cumulativeOffset += segmentLength;

          return (
            <motion.circle
              key={segment.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "center",
              }}
            />
          );
        })}
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={isDarkMode ? "white" : "#111827"}
          fontSize="18"
          fontWeight="bold"
        >
          1B
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={isDarkMode ? "rgba(148,163,184,0.6)" : "rgba(100,116,139,0.6)"}
          fontSize="10"
        >
          BUDJU
        </text>
      </svg>
    );
  };

  const summaryRows = [
    {
      label: "Total Supply",
      value: totalSupply,
      colorClass: isDarkMode ? "text-white" : "text-gray-900",
      bold: true,
    },
    {
      label: "Burned Tokens",
      value: burnedTokens,
      colorClass: "text-red-400",
      bold: false,
    },
    {
      label: "Raydium Vault",
      value: raydiumVault,
      colorClass: "text-emerald-400",
      bold: false,
    },
    {
      label: "Bank of BUDJU",
      value: bankOfBudju,
      colorClass: "text-amber-400",
      bold: false,
    },
    {
      label: "Pool of BUDJU",
      value: communityVault,
      colorClass: "text-pink-400",
      bold: false,
    },
    {
      label: "Circ. Supply",
      value: remainingSupply,
      colorClass: isDarkMode ? "text-cyan-400" : "text-cyan-600",
      bold: true,
    },
  ];

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
            Token{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              Supply
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Explore BUDJU token allocation and distribution data
          </p>
        </motion.div>

        {loading && (
          <div
            className={`text-center text-sm mb-6 ${
              isDarkMode ? "text-gray-500" : "text-gray-400"
            }`}
          >
            Loading supply data...
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Donut Chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={`rounded-xl border p-6 flex flex-col items-center justify-center ${
              isDarkMode
                ? "bg-[#0c0c20]/60 border-white/[0.06]"
                : "bg-white/60 border-gray-200/40"
            } backdrop-blur-sm`}
          >
            <div className="w-full max-w-[280px] aspect-square">
              {renderDonutChart()}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-6">
              {tokenAllocation.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span
                    className={`text-[11px] ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {item.name}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Distribution Details */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className={`rounded-xl border p-5 ${
              isDarkMode
                ? "bg-[#0c0c20]/60 border-white/[0.06]"
                : "bg-white/60 border-gray-200/40"
            } backdrop-blur-sm`}
          >
            <h3
              className={`text-sm font-semibold mb-4 flex items-center gap-2 ${
                isDarkMode ? "text-gray-300" : "text-gray-700"
              }`}
            >
              <FaChartPie
                className={`w-3 h-3 ${
                  isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                }`}
              />
              Distribution
            </h3>

            {/* Allocation bars */}
            <div className="space-y-3">
              {tokenAllocation.map((item, index) => (
                <motion.div
                  key={item.name}
                  initial={{ opacity: 0, x: 10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: index * 0.06 }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span
                        className={`text-xs ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        {item.name}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-mono font-semibold ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {item.percentage.toFixed(2)}%
                    </span>
                  </div>
                  <div
                    className={`h-1.5 rounded-full overflow-hidden ${
                      isDarkMode ? "bg-white/[0.04]" : "bg-gray-100"
                    }`}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                      initial={{ width: 0 }}
                      whileInView={{
                        width: `${Math.max(item.percentage, 0.5)}%`,
                      }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.8,
                        delay: index * 0.1,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                  <p
                    className={`text-[10px] mt-0.5 ${
                      isDarkMode ? "text-gray-600" : "text-gray-400"
                    }`}
                  >
                    {item.value.toLocaleString()} BUDJU
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Summary */}
            <div
              className={`mt-5 pt-4 border-t space-y-2 ${
                isDarkMode ? "border-white/[0.06]" : "border-gray-200/40"
              }`}
            >
              {summaryRows.map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between items-center"
                >
                  <span
                    className={`text-xs ${
                      isDarkMode ? "text-gray-500" : "text-gray-400"
                    }`}
                  >
                    {row.label}
                  </span>
                  <span
                    className={`text-xs font-mono ${row.bold ? "font-bold" : "font-medium"} ${row.colorClass}`}
                  >
                    {row.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <p
          className={`text-center text-[10px] mt-6 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          * Token distribution data is updated in real-time from blockchain data
        </p>
      </div>
    </section>
  );
};

export default TokenSupply;
