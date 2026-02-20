import { Link } from "react-router";
import { motion } from "framer-motion";
import { FaRobot, FaChartLine, FaBolt, FaShieldAlt, FaBrain } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

const features = [
  {
    icon: FaChartLine,
    title: "Automated Trading",
    description:
      "Execute trades on Raydium via Jupiter aggregation with precision timing and optimal routing.",
    accent: "text-cyan-400",
  },
  {
    icon: FaBolt,
    title: "Real-Time Signals",
    description:
      "Monitor SOL/BUDJU and USDC/BUDJU pairs with live buy/sell signal detection.",
    accent: "text-emerald-400",
  },
  {
    icon: FaShieldAlt,
    title: "Portfolio Protection",
    description:
      "Built-in slippage control, MEV protection, and smart order execution on Solana.",
    accent: "text-blue-400",
  },
  {
    icon: FaBrain,
    title: "AI-Powered Analysis",
    description:
      "Market analysis and pattern recognition to identify optimal entry and exit points.",
    accent: "text-purple-400",
  },
];

const BotAccess = () => {
  const { isDarkMode } = useTheme();

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <FaRobot
              className={`w-6 h-6 ${
                isDarkMode ? "text-cyan-400" : "text-cyan-600"
              }`}
            />
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              The{" "}
              <span className="bg-gradient-to-r from-cyan-400 via-budju-blue to-budju-pink bg-clip-text text-transparent">
                Trading Bot
              </span>
            </h2>
          </div>
          <p
            className={`text-base max-w-2xl mx-auto mb-2 ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            The centrepiece of the BUDJU ecosystem. Automated DeFi trading
            powered by Solana's speed and Jupiter's liquidity.
          </p>
        </motion.div>

        {/* Entry Requirement Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-12"
        >
          <div
            className={`rounded-2xl p-[1px] ${
              isDarkMode
                ? "bg-gradient-to-r from-amber-500/50 via-yellow-400/30 to-amber-500/50"
                : "bg-gradient-to-r from-amber-500/40 via-yellow-400/25 to-amber-500/40"
            }`}
          >
            <div
              className={`rounded-2xl px-6 md:px-10 py-6 md:py-8 text-center ${
                isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
              } backdrop-blur-sm`}
            >
              <p
                className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-3 ${
                  isDarkMode ? "text-amber-400/70" : "text-amber-600/70"
                }`}
              >
                Entry Requirement
              </p>
              <p
                className={`text-3xl md:text-4xl lg:text-5xl font-black font-display mb-3 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                <span
                  className={`font-mono ${
                    isDarkMode ? "text-amber-400" : "text-amber-600"
                  }`}
                >
                  10,000,000
                </span>{" "}
                BUDJU
              </p>
              <p
                className={`text-sm md:text-base max-w-xl mx-auto mb-6 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Hold 10 million BUDJU in your connected wallet to unlock full
                access to the trading bot, live signals, and automated
                execution. This is your ticket into the most exciting trading
                board on Solana.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to={ROUTES.SWAP}
                  className="hero-btn-primary text-center text-sm font-bold px-8 py-3 rounded-xl inline-flex items-center justify-center gap-2"
                >
                  <FaRobot className="w-3.5 h-3.5" />
                  Get BUDJU Now
                </Link>
                <Link
                  to={ROUTES.HOW_TO_BUY}
                  className={`hero-btn-secondary text-center text-sm font-bold px-8 py-3 rounded-xl ${
                    !isDarkMode
                      ? "text-gray-900 border-gray-300 hover:border-gray-900"
                      : ""
                  }`}
                >
                  How to Buy
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bot Features Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
              className={`rounded-xl border p-5 ${
                isDarkMode
                  ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
                  : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
              } backdrop-blur-sm transition-all duration-300`}
            >
              <feature.icon className={`w-5 h-5 ${feature.accent} mb-3`} />
              <h3
                className={`text-sm font-bold mb-1.5 ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {feature.title}
              </h3>
              <p
                className={`text-xs leading-relaxed ${
                  isDarkMode ? "text-gray-500" : "text-gray-500"
                }`}
              >
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BotAccess;
