import { motion } from "framer-motion";
import { FaHistory } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { TOKEN_INFO } from "@constants/config";

interface HistoryEvent {
  date: string;
  title: string;
  description: string;
  icon: string;
}

const historyEvents: HistoryEvent[] = [
  {
    date: TOKEN_INFO.FIRST_CREATED,
    title: "BUDJU Token Created",
    description:
      "BUDJU Token was officially launched on the Solana blockchain.",
    icon: "🚀",
  },
  {
    date: "February 10, 2025",
    title: "Listed on Raydium",
    description:
      "BUDJU was listed on Raydium DEX, providing better liquidity and trading options for holders.",
    icon: "📊",
  },
  {
    date: "February 15, 2025",
    title: "First Burn Event",
    description:
      "The first token burn occurred, removing 500,000 BUDJU from circulation to increase scarcity.",
    icon: "🔥",
  },
  {
    date: "February 20, 2025",
    title: "Bank of BUDJU Launched",
    description:
      "Bank of BUDJU was established to manage token buybacks and community initiatives.",
    icon: "🏦",
  },
  {
    date: "February 26, 2025",
    title: "Second Burn Event",
    description:
      "Another 1,069,299 BUDJU tokens were burned as part of the deflationary tokenomics.",
    icon: "🔥",
  },
  {
    date: "March 2025 — February 2026",
    title: "12 Months of Darkness",
    description:
      "The original developer went silent, leaving the BUDJU community in the dark for a full year. Despite no updates, the community held strong and kept the faith alive.",
    icon: "🌑",
  },
  {
    date: "February 2026",
    title: "Into the Light — A New Era",
    description:
      "BUDJU emerged from the darkness and into new ground. With the help of Claude, Anthropic's super AI, the project was revived with a completely redesigned website, modern infrastructure, and a renewed vision for the future.",
    icon: "🌅",
  },
  {
    date: "February 2026",
    title: "BUDJU Trading Bot Launched",
    description:
      "The BUDJU Trading Bot was launched, giving holders access to automated trading tools powered by AI. Hold 10M BUDJU to unlock full bot access.",
    icon: "🤖",
  },
];

const TokenHistory = () => {
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
            Token{" "}
            <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
              History
            </span>
          </h2>
          <p
            className={`text-sm ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Key milestones in the BUDJU journey
          </p>
        </motion.div>

        {/* Timeline */}
        <div className="max-w-2xl mx-auto relative">
          {/* Vertical line */}
          <div
            className={`absolute left-5 md:left-6 top-0 bottom-0 w-px ${
              isDarkMode ? "bg-white/[0.06]" : "bg-gray-200/60"
            }`}
          />

          <div className="space-y-1">
            {historyEvents.map((event, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
                className="relative flex gap-4 md:gap-5 pl-1"
              >
                {/* Timeline dot */}
                <div className="relative flex-shrink-0 w-10 md:w-12 flex items-start justify-center pt-5">
                  <div
                    className={`w-8 h-8 md:w-9 md:h-9 rounded-full flex items-center justify-center text-sm z-10 border-2 ${
                      isDarkMode
                        ? "bg-[#0c0c20] border-cyan-500/30"
                        : "bg-white border-cyan-500/20"
                    }`}
                  >
                    {event.icon}
                  </div>
                </div>

                {/* Content card */}
                <div
                  className={`flex-1 rounded-xl border p-4 mb-3 ${
                    isDarkMode
                      ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.1]"
                      : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
                  } backdrop-blur-sm transition-colors`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <FaHistory
                      className={`w-2.5 h-2.5 ${
                        isDarkMode ? "text-cyan-400/50" : "text-cyan-600/50"
                      }`}
                    />
                    <span
                      className={`text-[10px] font-mono uppercase tracking-wider ${
                        isDarkMode ? "text-cyan-400/70" : "text-cyan-600/70"
                      }`}
                    >
                      {event.date}
                    </span>
                  </div>
                  <h3
                    className={`text-sm font-bold mb-1 ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {event.title}
                  </h3>
                  <p
                    className={`text-xs leading-relaxed ${
                      isDarkMode ? "text-gray-500" : "text-gray-500"
                    }`}
                  >
                    {event.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className={`text-center text-[10px] mt-8 ${
            isDarkMode ? "text-gray-600" : "text-gray-400"
          }`}
        >
          BUDJU continues to grow and evolve with our community
        </motion.p>
      </div>
    </section>
  );
};

export default TokenHistory;
