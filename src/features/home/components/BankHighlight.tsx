import { motion } from "framer-motion";
import { Link } from "react-router";
import {
  FaUniversity,
  FaFire,
  FaCoins,
  FaHandHoldingUsd,
  FaArrowRight,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

const pillars = [
  {
    icon: FaCoins,
    title: "Deposits",
    desc: "Community members deposit SOL, BUDJU, or other tokens to support the project and earn rewards.",
    accent: "amber",
  },
  {
    icon: FaUniversity,
    title: "Investment",
    desc: "The Bank invests in platform development, staking, and providing liquidity on the Solana blockchain.",
    accent: "cyan",
  },
  {
    icon: FaFire,
    title: "Buyback & Burn",
    desc: "Regular token buybacks and burns create scarcity and drive long-term value for all holders.",
    accent: "pink",
  },
  {
    icon: FaHandHoldingUsd,
    title: "Community Rewards",
    desc: "Your investment fuels growth. We note every deposit — help us, and we'll reward you.",
    accent: "emerald",
  },
];

const accentClasses: Record<
  string,
  { icon: string; iconDark: string; border: string; borderDark: string; bg: string; bgDark: string }
> = {
  amber: {
    icon: "text-amber-600",
    iconDark: "text-amber-400",
    border: "border-amber-500/15",
    borderDark: "border-amber-500/20",
    bg: "bg-amber-500/10",
    bgDark: "bg-amber-500/15",
  },
  cyan: {
    icon: "text-cyan-600",
    iconDark: "text-cyan-400",
    border: "border-cyan-500/15",
    borderDark: "border-cyan-500/20",
    bg: "bg-cyan-500/10",
    bgDark: "bg-cyan-500/15",
  },
  pink: {
    icon: "text-budju-pink-dark",
    iconDark: "text-budju-pink",
    border: "border-budju-pink/15",
    borderDark: "border-budju-pink/20",
    bg: "bg-budju-pink/10",
    bgDark: "bg-budju-pink/15",
  },
  emerald: {
    icon: "text-emerald-600",
    iconDark: "text-emerald-400",
    border: "border-emerald-500/15",
    borderDark: "border-emerald-500/20",
    bg: "bg-emerald-500/10",
    bgDark: "bg-emerald-500/15",
  },
};

const BankHighlight = () => {
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
            <FaUniversity
              className={`w-6 h-6 ${
                isDarkMode ? "text-amber-400" : "text-amber-600"
              }`}
            />
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Bank of{" "}
              <span className="bg-gradient-to-r from-amber-400 via-budju-pink to-budju-blue bg-clip-text text-transparent">
                BUDJU
              </span>
            </h2>
          </div>
          <p
            className={`text-base max-w-2xl mx-auto ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Revenue from merch, staked SOL interest, VCs, and NFTs flows into
            the Bank — fuelling development, liquidity, and the BUY BURN BUDJU
            initiative.
          </p>
        </motion.div>

        {/* How The Bank Works — 4 pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {pillars.map((pillar, index) => {
            const a = accentClasses[pillar.accent];
            return (
              <motion.div
                key={pillar.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className={`rounded-xl border p-5 text-center ${
                  isDarkMode ? a.borderDark : a.border
                } ${
                  isDarkMode ? "bg-[#0c0c20]/60" : "bg-white/60"
                } backdrop-blur-sm transition-all duration-300 ${
                  isDarkMode
                    ? "hover:border-white/[0.12]"
                    : "hover:border-gray-300/60"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                    isDarkMode ? a.bgDark : a.bg
                  }`}
                >
                  <pillar.icon
                    className={`w-5 h-5 ${isDarkMode ? a.iconDark : a.icon}`}
                  />
                </div>
                <h3
                  className={`text-sm font-bold mb-1.5 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {pillar.title}
                </h3>
                <p
                  className={`text-xs leading-relaxed ${
                    isDarkMode ? "text-gray-500" : "text-gray-500"
                  }`}
                >
                  {pillar.desc}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center"
        >
          <Link
            to={ROUTES.BANK}
            className={`inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 ${
              isDarkMode
                ? "bg-gradient-to-r from-amber-400 to-budju-pink text-white shadow-lg shadow-amber-400/20 hover:shadow-amber-400/40"
                : "bg-gradient-to-r from-amber-500 to-budju-pink text-white shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50"
            }`}
          >
            <FaUniversity className="w-4 h-4" />
            View Bank Holdings
            <FaArrowRight className="w-3 h-3" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

export default BankHighlight;
