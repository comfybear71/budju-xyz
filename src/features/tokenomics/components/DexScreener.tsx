import { motion } from "framer-motion";
import { FaChartBar } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

const DexScreener = () => {
  const { isDarkMode } = useTheme();

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
            Dex
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              Screener
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Live trading data from DexScreener
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className={`max-w-5xl mx-auto rounded-xl border overflow-hidden ${
            isDarkMode
              ? "bg-[#0c0c20]/60 border-white/[0.06]"
              : "bg-white/60 border-gray-200/40"
          } backdrop-blur-sm`}
        >
          {/* Header bar */}
          <div
            className={`flex items-center justify-between px-5 py-3 border-b ${
              isDarkMode ? "border-white/[0.06]" : "border-gray-200/40"
            }`}
          >
            <div className="flex items-center gap-2">
              <FaChartBar
                className={`w-3 h-3 ${
                  isDarkMode ? "text-cyan-400/60" : "text-cyan-600/60"
                }`}
              />
              <span
                className={`text-xs font-semibold ${
                  isDarkMode ? "text-gray-400" : "text-gray-500"
                }`}
              >
                BUDJU/SOL — DexScreener
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

          {/* Chart iframe */}
          <div className="relative w-full" style={{ minHeight: "600px", paddingBottom: "100%" }}>
            <iframe
              src="https://dexscreener.com/solana/6pmhvxg7a3wcekbpgjgmvivbg1nufsz9na7caqsjxmez?embed=1&loadChartSettings=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=0&chartType=usd&interval=15"
              className="absolute top-0 left-0 w-full h-full"
              title="BUDJU DexScreener Chart"
              frameBorder="0"
            />
          </div>
        </motion.div>

        <p
          className={`text-center text-[10px] mt-6 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          Powered by DexScreener — Real-time DEX trading data and charts
        </p>
      </div>
    </section>
  );
};

export default DexScreener;
