import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BURN_ADDRESS, BURN_ADDRESS_ACCOUNT } from "@constants/addresses";
import { TOKEN_INFO } from "@constants/config";
import CopyToClipboard from "@components/common/CopyToClipboard";
import {
  fetchBurnEvents,
  fetchHeliusTokenMetrics,
  TOKEN_ADDRESS,
  BURN_ADDRESS as SERVICE_BURN_ADDRESS,
} from "@lib/utils/tokenService";
import { useTheme } from "@/context/ThemeContext";
import { FaExternalLinkAlt, FaFire, FaChartBar, FaDollarSign } from "react-icons/fa";

interface BurnEvent {
  date: string;
  amount: number;
  txHash: string;
  value: number;
}

// Animated counter that spins up when scrolled into view
const AnimatedCounter = ({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView || value === 0) {
      setDisplayValue(value);
      return;
    }

    const duration = 1500;
    const startTime = performance.now();
    let animationFrame: number;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(eased * value);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [isInView, value]);

  const formatted = decimals > 0
    ? displayValue.toFixed(decimals)
    : Math.floor(displayValue).toLocaleString();

  return (
    <span ref={ref} className={className}>
      {prefix}{formatted}{suffix}
    </span>
  );
};

const BurnStatistics = () => {
  const { isDarkMode } = useTheme();
  const SOLSCAN_BURN_LINK = `https://solscan.io/account/${BURN_ADDRESS_ACCOUNT}`;

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

      // Fetch metrics to get the real burned amount from supply reduction
      const [metrics, events] = await Promise.all([
        fetchHeliusTokenMetrics(TOKEN_ADDRESS, SERVICE_BURN_ADDRESS),
        fetchBurnEvents().catch(() => [] as BurnEvent[]),
      ]);

      const burned = metrics.burned;
      const price = metrics.price;
      const percentage = TOKEN_INFO.TOTAL_SUPPLY > 0
        ? (burned / TOKEN_INFO.TOTAL_SUPPLY) * 100
        : 0;

      setTotalBurned(burned);
      setPercentageBurned(percentage);
      setTotalValue(burned * price);
      setBurnEvents(events);
    } catch (err) {
      console.error("Error fetching burn data:", err);
      setError("Unable to load burn data. Please try again later.");
      setBurnEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBurnData();
    const interval = setInterval(fetchBurnData, 300000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    {
      label: "Total Burned",
      icon: FaFire,
      iconColor: "text-red-400",
      bgColor: isDarkMode ? "bg-red-500/10" : "bg-red-50",
      value: totalBurned,
      suffix: " BUDJU",
      decimals: 0,
    },
    {
      label: "Percentage of Supply",
      icon: FaChartBar,
      iconColor: isDarkMode ? "text-cyan-400" : "text-cyan-600",
      bgColor: isDarkMode ? "bg-cyan-500/10" : "bg-cyan-50",
      value: percentageBurned,
      suffix: "%",
      decimals: 6,
    },
    {
      label: "Total Value Burned",
      icon: FaDollarSign,
      iconColor: "text-emerald-400",
      bgColor: isDarkMode ? "bg-emerald-500/10" : "bg-emerald-50",
      value: totalValue,
      prefix: "$",
      decimals: 2,
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
            Burn{" "}
            <span className="bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
              Statistics
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            BUDJU implements a deflationary model through strategic token burns
          </p>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-8">
          {statCards.map((card, index) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`rounded-xl border p-5 text-center ${
                isDarkMode
                  ? "bg-[#0c0c20]/60 border-white/[0.06]"
                  : "bg-white/60 border-gray-200/40"
              } backdrop-blur-sm`}
            >
              <div
                className={`w-10 h-10 rounded-lg ${card.bgColor} flex items-center justify-center mx-auto mb-3`}
              >
                <card.icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <p
                className={`text-xs mb-1 ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {card.label}
              </p>
              {loading ? (
                <p
                  className={`text-lg font-bold font-mono ${
                    isDarkMode ? "text-gray-600" : "text-gray-300"
                  }`}
                >
                  ...
                </p>
              ) : (
                <AnimatedCounter
                  value={card.value}
                  prefix={card.prefix}
                  suffix={card.suffix}
                  decimals={card.decimals}
                  className={`text-lg font-bold font-mono ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Burn Address Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className={`max-w-2xl mx-auto rounded-xl border p-5 md:p-6 mb-8 ${
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
            <FaFire
              className={`w-3 h-3 ${
                isDarkMode ? "text-red-400/60" : "text-red-500/60"
              }`}
            />
            Burn Address
          </h3>
          <div
            className={`flex items-center gap-2 p-3 rounded-lg ${
              isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"
            }`}
          >
            <code
              className={`text-xs font-mono truncate flex-1 ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
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
                  ? "text-gray-500 hover:text-gray-300 hover:bg-white/[0.05]"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              }`}
              aria-label="View on Solscan"
            >
              <FaExternalLinkAlt size={12} />
            </a>
          </div>
          <p
            className={`text-[10px] mt-2 ${
              isDarkMode ? "text-gray-600" : "text-gray-400"
            }`}
          >
            Tokens sent to this address are removed from circulation permanently
          </p>
        </motion.div>

        {/* Burn History */}
        {!loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className={`max-w-2xl mx-auto rounded-xl border p-5 md:p-6 ${
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
              <FaChartBar
                className={`w-3 h-3 ${
                  isDarkMode ? "text-red-400/60" : "text-red-500/60"
                }`}
              />
              Burn History
            </h3>

            {error ? (
              <p
                className={`text-center text-sm py-4 ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                {error}
              </p>
            ) : burnEvents.length === 0 ? (
              <p
                className={`text-center text-sm py-4 ${
                  isDarkMode ? "text-gray-500" : "text-gray-400"
                }`}
              >
                No burn transaction events found yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className={`border-b ${
                        isDarkMode ? "border-white/[0.06]" : "border-gray-200/40"
                      }`}
                    >
                      <th
                        className={`py-2 px-2 text-left text-[10px] font-medium uppercase tracking-wider ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Date
                      </th>
                      <th
                        className={`py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Amount
                      </th>
                      <th
                        className={`py-2 px-2 text-right text-[10px] font-medium uppercase tracking-wider ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Value
                      </th>
                      <th
                        className={`py-2 px-2 text-left text-[10px] font-medium uppercase tracking-wider ${
                          isDarkMode ? "text-gray-500" : "text-gray-400"
                        }`}
                      >
                        Tx
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {burnEvents.map((event, index) => (
                      <tr
                        key={index}
                        className={`border-b last:border-b-0 ${
                          isDarkMode
                            ? "border-white/[0.04] hover:bg-white/[0.02]"
                            : "border-gray-100 hover:bg-gray-50/50"
                        } transition-colors`}
                      >
                        <td
                          className={`py-2.5 px-2 text-xs ${
                            isDarkMode ? "text-gray-400" : "text-gray-600"
                          }`}
                        >
                          {event.date}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right text-xs font-mono font-medium ${
                            isDarkMode ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                          {event.amount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-right text-xs font-mono text-emerald-400">
                          ${event.value.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2">
                          {event.txHash.startsWith("N/A") ? (
                            <span
                              className={`text-xs ${
                                isDarkMode ? "text-gray-600" : "text-gray-400"
                              }`}
                            >
                              Aggregated
                            </span>
                          ) : (
                            <a
                              href={`https://solscan.io/tx/${event.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-xs font-mono truncate block max-w-[100px] md:max-w-[140px] ${
                                isDarkMode
                                  ? "text-cyan-400/80 hover:text-cyan-300"
                                  : "text-cyan-600 hover:text-cyan-700"
                              }`}
                            >
                              {event.txHash.substring(0, 8)}...
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p
              className={`text-center text-[10px] mt-3 ${
                isDarkMode ? "text-gray-600" : "text-gray-400"
              }`}
            >
              All burn transactions are verifiable on the Solana blockchain
            </p>
          </motion.div>
        )}

        <p
          className={`text-center text-[10px] mt-6 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          * Burn data is calculated from on-chain supply reduction and updated in real-time
        </p>
      </div>
    </section>
  );
};

export default BurnStatistics;
