import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { POOL_SOL_BUDJU, POOL_USDC_BUDJU } from "@constants/addresses";
import { animateCounter } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";

// Mock data for pool statistics - in a production app, this would come from API calls
interface PoolStatData {
  name: string;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
  positions: number;
  tokenA: string;
  tokenB: string;
  colorA: string;
  colorB: string;
}

const initialPoolData: Record<string, PoolStatData> = {
  [POOL_SOL_BUDJU]: {
    name: "SOL-BUDJU Pool",
    tvl: 162450,
    volume24h: 28750,
    fees24h: 71.87,
    apr: 24.8,
    positions: 78,
    tokenA: "SOL",
    tokenB: "BUDJU",
    colorA: "bg-purple-600",
    colorB: "bg-budju-pink",
  },
  [POOL_USDC_BUDJU]: {
    name: "USDC-BUDJU Pool",
    tvl: 85440,
    volume24h: 13406,
    fees24h: 33.52,
    apr: 18.6,
    positions: 42,
    tokenA: "USDC",
    tokenB: "BUDJU",
    colorA: "bg-blue-500",
    colorB: "bg-budju-pink",
  },
};

const PoolStats = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const statsCardsRef = useRef<HTMLDivElement>(null);
  const [poolData, setPoolData] = useState(initialPoolData);

  // Simulate fetching updated pool data
  useEffect(() => {
    const fetchData = async () => {
      // In a real app, this would make API calls to fetch real-time data
      // For now, we'll just add small random variations to the mock data

      const updatedData = { ...initialPoolData };
      Object.keys(updatedData).forEach((key) => {
        const variation = 0.98 + Math.random() * 0.04; // ±2% random variation
        updatedData[key] = {
          ...updatedData[key],
          tvl: Math.round(updatedData[key].tvl * variation),
          volume24h: Math.round(updatedData[key].volume24h * variation),
          fees24h: parseFloat(
            (updatedData[key].fees24h * variation).toFixed(2),
          ),
          apr: parseFloat((updatedData[key].apr * variation).toFixed(1)),
        };
      });
      setPoolData(updatedData);
    };

    fetchData();
    // Set up polling interval (every 60 seconds)
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Animate stats counters
  useEffect(() => {
    if (statsCardsRef.current) {
      const cards = statsCardsRef.current.querySelectorAll(".pool-stats-card");

      // Create animations for the cards
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.6,
          scrollTrigger: {
            trigger: statsCardsRef.current,
            start: "top 80%",
          },
        },
      );

      // Animate the stat counters
      cards.forEach((card) => {
        const tvlEl = card.querySelector(".stat-tvl");
        const volumeEl = card.querySelector(".stat-volume");
        const feesEl = card.querySelector(".stat-fees");
        const aprEl = card.querySelector(".stat-apr");

        if (tvlEl && volumeEl && feesEl && aprEl) {
          const poolId = card.getAttribute("data-pool-id");
          if (poolId && poolData[poolId]) {
            const data = poolData[poolId];

            animateCounter(tvlEl, data.tvl, { prefix: "$", decimals: 0 });
            animateCounter(volumeEl, data.volume24h, {
              prefix: "$",
              decimals: 0,
            });
            animateCounter(feesEl, data.fees24h, { prefix: "$", decimals: 2 });
            animateCounter(aprEl, data.apr, { suffix: "%", decimals: 1 });
          }
        }
      });
    }
  }, [poolData]);

  // Calculate total TVL across all pools
  const totalTVL = Object.values(poolData).reduce(
    (sum, pool) => sum + pool.tvl,
    0,
  );

  return (
    <section id="pool-stats" ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-budju-blue">Live</span>{" "}
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              Pool Statistics
            </span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Current data from the official BUDJU liquidity pools
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center mb-10"
        >
          <div
            className={isDarkMode ? "text-gray-400 mb-1" : "text-white/80 mb-1"}
          >
            Total Value Locked
          </div>
          <div
            className={`text-4xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"}`}
          >
            ${totalTVL.toLocaleString()}
          </div>
        </motion.div>

        <div
          ref={statsCardsRef}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
        >
          {/* SOL-BUDJU Pool Stats */}
          <div
            className={`pool-stats-card ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 relative overflow-hidden border-purple-600/30`}
            data-pool-id={POOL_SOL_BUDJU}
          >
            {/* Background decoration */}
            <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-purple-600/20 blur-xl"></div>
            <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-budju-pink/20 blur-xl"></div>

            <div className="relative">
              <div className="flex items-center mb-6">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center z-10">
                    <span className="text-sm font-bold text-white">SOL</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-budju-pink flex items-center justify-center">
                    <span className="text-sm font-bold text-white">BUDJU</span>
                  </div>
                </div>
                <h3
                  className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} ml-3`}
                >
                  SOL-BUDJU Pool
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    TVL
                  </div>
                  <div
                    className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} stat-tvl`}
                  >
                    ${poolData[POOL_SOL_BUDJU].tvl.toLocaleString()}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    24h Volume
                  </div>
                  <div className="text-xl font-bold text-budju-blue stat-volume">
                    ${poolData[POOL_SOL_BUDJU].volume24h.toLocaleString()}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    24h Fees
                  </div>
                  <div className="text-xl font-bold text-green-400 stat-fees">
                    ${poolData[POOL_SOL_BUDJU].fees24h.toFixed(2)}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    Est. APR
                  </div>
                  <div className="text-xl font-bold text-budju-pink stat-apr">
                    {poolData[POOL_SOL_BUDJU].apr.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 text-center ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
              >
                Active Positions:{" "}
                <span
                  className={isDarkMode ? "text-white" : "text-budju-white"}
                >
                  {poolData[POOL_SOL_BUDJU].positions}
                </span>
              </div>
            </div>
          </div>

          {/* USDC-BUDJU Pool Stats */}
          <div
            className={`pool-stats-card ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 relative overflow-hidden border-blue-500/30`}
            data-pool-id={POOL_USDC_BUDJU}
          >
            {/* Background decoration */}
            <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-blue-500/20 blur-xl"></div>
            <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-budju-pink/20 blur-xl"></div>

            <div className="relative">
              <div className="flex items-center mb-6">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center z-10">
                    <span className="text-sm font-bold text-white">USDC</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-budju-pink flex items-center justify-center">
                    <span className="text-sm font-bold text-white">BUDJU</span>
                  </div>
                </div>
                <h3
                  className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} ml-3`}
                >
                  USDC-BUDJU Pool
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    TVL
                  </div>
                  <div
                    className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} stat-tvl`}
                  >
                    ${poolData[POOL_USDC_BUDJU].tvl.toLocaleString()}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    24h Volume
                  </div>
                  <div className="text-xl font-bold text-budju-blue stat-volume">
                    ${poolData[POOL_USDC_BUDJU].volume24h.toLocaleString()}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    24h Fees
                  </div>
                  <div className="text-xl font-bold text-green-400 stat-fees">
                    ${poolData[POOL_USDC_BUDJU].fees24h.toFixed(2)}
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode
                        ? "text-gray-400 text-sm mb-1"
                        : "text-white/80 text-sm mb-1"
                    }
                  >
                    Est. APR
                  </div>
                  <div className="text-xl font-bold text-budju-pink stat-apr">
                    {poolData[POOL_USDC_BUDJU].apr.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 text-center ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
              >
                Active Positions:{" "}
                <span
                  className={isDarkMode ? "text-white" : "text-budju-white"}
                >
                  {poolData[POOL_USDC_BUDJU].positions}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className={`text-center mt-6 ${isDarkMode ? "text-gray-400" : "text-white/80"} text-sm`}
        >
          Data updates automatically every 60 seconds. Last updated:{" "}
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </section>
  );
};

export default PoolStats;
