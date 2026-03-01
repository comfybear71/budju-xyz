import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { BURN_ADDRESS } from "@constants/addresses";
import { TOKEN_INFO } from "@constants/config";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { animateCounter } from "@/lib/utils/animation";
import {
  fetchBurnEvents,
  fetchHeliusTokenMetrics,
  TOKEN_ADDRESS,
  BURN_ADDRESS as SERVICE_BURN_ADDRESS,
} from "@lib/utils/tokenService";
import { useTheme } from "@/context/ThemeContext";

gsap.registerPlugin(ScrollTrigger);

interface BurnEvent {
  date: string;
  amount: number;
  txHash: string;
  value: number;
}

const BurnStatistics = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const burnedCountRef = useRef<HTMLSpanElement>(null);
  const percentageRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);


  

  const [burnEvents, setBurnEvents] = useState<BurnEvent[]>([]);
  const [totalBurned, setTotalBurned] = useState(0);
  const [percentageBurned, setPercentageBurned] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBurnData = async () => {
    try {
      setLoading(true);
      setError(null);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), 15000);
      });

      // Fetch burn events AND on-chain metrics in parallel
      const dataPromise = Promise.all([
        fetchBurnEvents(),
        fetchHeliusTokenMetrics(TOKEN_ADDRESS, SERVICE_BURN_ADDRESS),
      ]);
      const [events, metrics] = (await Promise.race([
        dataPromise,
        timeoutPromise,
      ])) as [BurnEvent[], { burned: number; price: number }];

      // Use the on-chain burn wallet balance as the source of truth
      // This is more accurate than summing individual events which could
      // miss older transactions beyond the signature fetch limit.
      const burned = metrics.burned;
      const price = metrics.price;
      const percentage = TOKEN_INFO.TOTAL_SUPPLY > 0
        ? (burned / TOKEN_INFO.TOTAL_SUPPLY) * 100
        : 0;

      setTotalBurned(burned);
      setPercentageBurned(percentage);
      setTotalValue(burned * price);

      if (!events || events.length === 0) {
        console.log("No burn events found.");
        setBurnEvents([]);
      } else {
        setBurnEvents(events as BurnEvent[]);
      }
    } catch (err) {
      console.error("Error fetching burn data:", err);
      setError("Failed to fetch burn data. Please try again later.");
      setBurnEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("Running fetchBurnData useEffect");
    fetchBurnData();
    const interval = setInterval(() => {
      console.log("Polling fetchBurnData");
      fetchBurnData();
    }, 300000);
    return () => {
      console.log("Cleaning up interval");
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (
      !loading &&
      !error &&
      statsRef.current &&
      burnedCountRef.current &&
      percentageRef.current &&
      valueRef.current
    ) {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: statsRef.current,
          start: "top 80%",
        },
      });

      tl.add(() => {
        animateCounter(burnedCountRef.current!, totalBurned, {
          suffix: " BUDJU",
        });
        animateCounter(percentageRef.current!, percentageBurned, {
          suffix: "%",
          decimals: 2,
        });
        animateCounter(valueRef.current!, totalValue, {
          prefix: "$",
          decimals: 2,
        });
      });

      const flames = document.querySelectorAll(".burn-flame");
      flames.forEach((flame) => {
        gsap.to(flame, {
          scale: 1.2,
          opacity: 0.8,
          duration: 0.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });
    }
  }, [loading, error, totalBurned, percentageBurned, totalValue]);

  return (
    <section
      ref={sectionRef}
      className={`py-20 ${isDarkMode ? "bg-gradient-to-b from-budju-black to-gray-900" : "bg-gradient-to-b from-budju-pink-light to-purple-400"}`}
    >
      {/* Add CSS for pulsing animation */}
      <style>
        {`
          .loading-pulse {
            animation: pulse 1.5s infinite ease-in-out;
          }
          @keyframes pulse {
            0% {
              transform: scale(1);
              opacity: 0.8;
            }
            50% {
              transform: scale(1.1);
              opacity: 1;
            }
            100% {
              transform: scale(1);
              opacity: 0.8;
            }
          }
        `}
      </style>

      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              BURN
            </span>{" "}
            <span className="text-budju-pink">STATISTICS</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            BUDJU implements a deflationary tokenomics model through strategic
            token burns
          </p>
        </motion.div>

        {loading ? (
          <div
            className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"} mb-6`}
          >
            Loading burn data...
          </div>
        ) : error ? (
          <div className="text-center text-red-400 mb-6">{error}</div>
        ) : null}

        <div
          ref={statsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className={
              isDarkMode
                ? "budju-card p-6 text-center"
                : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
            }
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div
                className={`absolute inset-0 bg-red-500/30 rounded-full blur-md burn-flame ${
                  loading ? "loading-pulse" : ""
                }`}
              ></div>
              <div
                className={`relative bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center ${
                  loading ? "loading-pulse" : ""
                }`}
              >
                <span className="text-3xl">🔥</span>
              </div>
            </div>
            <h3
              className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} mb-2`}
            >
              Total Burned
            </h3>
            <p
              className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-white"}`}
            >
              <span ref={burnedCountRef}>
                {loading
                  ? "Loading..."
                  : totalBurned.toLocaleString() + " BUDJU"}
              </span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className={
              isDarkMode
                ? "budju-card p-6 text-center"
                : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
            }
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div
                className={`absolute inset-0 bg-budju-blue/30 rounded-full blur-md ${
                  loading ? "loading-pulse" : ""
                }`}
              ></div>
              <div
                className={`relative bg-budju-blue/20 w-16 h-16 rounded-full flex items-center justify-center ${
                  loading ? "loading-pulse" : ""
                }`}
              >
                <span className="text-3xl">📊</span>
              </div>
            </div>
            <h3
              className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} mb-2`}
            >
              Percentage of Supply
            </h3>
            <p
              className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-white"}`}
            >
              <span ref={percentageRef}>
                {loading ? "Loading..." : `${percentageBurned.toFixed(2)}%`}
              </span>
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className={
              isDarkMode
                ? "budju-card p-6 text-center"
                : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
            }
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div
                className={`absolute inset-0 bg-green-500/30 rounded-full blur-md ${
                  loading ? "loading-pulse" : ""
                }`}
              ></div>
              <div
                className={`relative bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center ${
                  loading ? "loading-pulse" : ""
                }`}
              >
                <span className="text-3xl">💰</span>
              </div>
            </div>
            <h3
              className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} mb-2`}
            >
              Total Value Burned
            </h3>
            <p
              className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-white"}`}
            >
              <span ref={valueRef}>
                {loading ? "Loading..." : `$${totalValue.toFixed(2)}`}
              </span>
            </p>
          </motion.div>
        </div>

        {(!loading || error) && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className={`max-w-4xl mx-auto ${isDarkMode ? "bg-gray-900/50 border-gray-800" : "bg-white/20 border-white/30"} rounded-xl border p-6 mb-12`}
            >
              <h3 className="text-xl font-semibold mb-4 text-center">
                <span className="text-budju-pink">BURNED TOKEN</span>{" "}
                <span
                  className={isDarkMode ? "text-white" : "text-budju-white"}
                >
                  ADDRESS
                </span>
              </h3>
              <div
                className={`flex items-center ${isDarkMode ? "bg-gray-800/80" : "bg-white/30"} p-3 rounded-lg`}
              >
                <code
                  className={`text-sm ${isDarkMode ? "text-gray-300" : "text-white"} font-mono truncate flex-1`}
                >
                  {BURN_ADDRESS}
                </code>
                <CopyToClipboard text={BURN_ADDRESS} />
              </div>
              <p
                className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"} mt-4 text-sm`}
              >
                This is the official burn address for BUDJU tokens. Tokens sent
                to this address are removed from circulation permanently.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="max-w-4xl mx-auto"
            >
              <h3 className="text-xl font-semibold mb-6 text-center">
                <span
                  className={isDarkMode ? "text-white" : "text-budju-white"}
                >
                  Burn
                </span>{" "}
                <span className="text-budju-pink">History</span>
              </h3>
              <div className="overflow-x-auto">
                <table
                  className={`w-full border-collapse ${!isDarkMode && "bg-white/10 rounded-lg overflow-hidden"}`}
                >
                  <thead>
                    <tr
                      className={isDarkMode ? "bg-gray-900/50" : "bg-white/20"}
                    >
                      <th className="py-3 px-4 text-left text-budju-blue font-medium">
                        Date
                      </th>
                      <th className="py-3 px-4 text-right text-budju-blue font-medium">
                        Amount
                      </th>
                      <th className="py-3 px-4 text-right text-budju-blue font-medium">
                        Value
                      </th>
                      <th className="py-3 px-4 text-left text-budju-blue font-medium">
                        Transaction
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {burnEvents.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className={`py-3 px-4 text-center ${isDarkMode ? "text-gray-400" : "text-white/80"}`}
                        >
                          No burn events found.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {burnEvents.map((event, index) => (
                          <tr
                            key={index}
                            className={`${isDarkMode ? "border-b border-gray-800 hover:bg-gray-800/30" : "border-b border-white/20 hover:bg-white/30"} transition-colors`}
                          >
                            <td
                              className={
                                isDarkMode
                                  ? "py-3 px-4 text-white"
                                  : "py-3 px-4 text-white"
                              }
                            >
                              {event.date}
                            </td>
                            <td
                              className={`py-3 px-4 text-right ${isDarkMode ? "text-white" : "text-white"} font-medium`}
                            >
                              {event.amount.toLocaleString()} BUDJU
                            </td>
                            <td className="py-3 px-4 text-right text-green-400">
                              ${event.value.toFixed(2)}
                            </td>
                            <td className="py-3 px-4">
                              {event.txHash.startsWith("N/A") ? (
                                <span
                                  className={
                                    isDarkMode ? "text-gray-400" : "text-white/80"
                                  }
                                >
                                  {event.txHash}
                                </span>
                              ) : (
                                <a
                                  href={`https://solscan.io/tx/${event.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-budju-blue hover:underline font-mono text-xs md:text-sm truncate block max-w-[150px] md:max-w-[200px]"
                                >
                                  {event.txHash.substring(0, 10)}...
                                </a>
                              )}
                            </td>
                          </tr>
                        ))}
                        {/* Total row */}
                        <tr
                          className={`${isDarkMode ? "border-t-2 border-gray-700 bg-gray-900/70" : "border-t-2 border-white/40 bg-white/30"}`}
                        >
                          <td
                            className={`py-3 px-4 font-bold ${isDarkMode ? "text-budju-pink" : "text-white"}`}
                          >
                            Total
                          </td>
                          <td
                            className={`py-3 px-4 text-right font-bold ${isDarkMode ? "text-white" : "text-white"}`}
                          >
                            {totalBurned.toLocaleString()} BUDJU
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-green-400">
                            ${totalValue.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs ${isDarkMode ? "text-gray-500" : "text-white/60"}`}
                            >
                              {percentageBurned.toFixed(6)}% of supply
                            </span>
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              <p
                className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"} mt-4 text-sm`}
              >
                All burn transactions are verifiable on the Solana blockchain
              </p>
            </motion.div>
          </>
        )}
      </div>
    </section>
  );
};

export default BurnStatistics;
