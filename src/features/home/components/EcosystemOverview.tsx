import { Link } from "react-router";
import { motion } from "framer-motion";
import {
  FaExchangeAlt,
  FaSwimmingPool,
  FaPiggyBank,
  FaBahai,
  FaShoppingCart,
  FaChartBar,
  FaRobot,
  FaFire,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

interface EcosystemCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  accent: string;
  accentBorder: string;
  accentGlow: string;
  link: string;
  external?: boolean;
  badge?: string;
}

const ecosystemCards: EcosystemCard[] = [
  {
    title: "Trading Bot",
    description:
      "Automated swaps powered by Jupiter. Execute trades on Solana with precision and speed.",
    icon: FaRobot,
    accent: "text-cyan-400",
    accentBorder: "border-cyan-500/20 hover:border-cyan-500/40",
    accentGlow: "rgba(6,182,212,0.06)",
    link: ROUTES.TRADE,
    badge: "CORE",
  },
  {
    title: "Liquidity Pools",
    description:
      "Provide liquidity on Raydium. Earn fees from SOL/BUDJU and USDC/BUDJU trading pairs.",
    icon: FaSwimmingPool,
    accent: "text-blue-400",
    accentBorder: "border-blue-500/20 hover:border-blue-500/40",
    accentGlow: "rgba(59,130,246,0.06)",
    link: ROUTES.POOL,
  },
  {
    title: "Bank of BUDJU",
    description:
      "Track deposits, monitor holdings, and view transaction history in real time.",
    icon: FaPiggyBank,
    accent: "text-emerald-400",
    accentBorder: "border-emerald-500/20 hover:border-emerald-500/40",
    accentGlow: "rgba(16,185,129,0.06)",
    link: ROUTES.BANK,
  },
  {
    title: "Token Burns",
    description:
      "Deflationary mechanics. Track BUDJU being removed from circulation permanently.",
    icon: FaFire,
    accent: "text-orange-400",
    accentBorder: "border-orange-500/20 hover:border-orange-500/40",
    accentGlow: "rgba(249,115,22,0.06)",
    link: ROUTES.BURN,
  },
  {
    title: "NFT Collection",
    description:
      "Exclusive BUDJU NFTs with holder benefits. Mint, collect, join the inner circle.",
    icon: FaBahai,
    accent: "text-purple-400",
    accentBorder: "border-purple-500/20 hover:border-purple-500/40",
    accentGlow: "rgba(168,85,247,0.06)",
    link: ROUTES.NFT,
  },
  {
    title: "Tokenomics",
    description:
      "Live supply data, burn tracking, holder analytics, and DexScreener integration.",
    icon: FaChartBar,
    accent: "text-budju-pink",
    accentBorder: "border-budju-pink/20 hover:border-budju-pink/40",
    accentGlow: "rgba(255,105,180,0.06)",
    link: ROUTES.TOKENOMICS,
  },
];

const EcosystemCardComponent = ({
  card,
  index,
}: {
  card: EcosystemCard;
  index: number;
}) => {
  const { isDarkMode } = useTheme();

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={`relative h-full rounded-xl border p-5 transition-all duration-300 group ${
        card.accentBorder
      } ${
        isDarkMode
          ? "bg-[#0c0c20]/60 hover:bg-[#0c0c20]/80"
          : "bg-white/60 hover:bg-white/80"
      } backdrop-blur-sm`}
      style={{
        boxShadow: `0 0 40px ${card.accentGlow}`,
      }}
    >
      {/* Badge */}
      {card.badge && (
        <div className="absolute top-3 right-3">
          <span
            className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${
              isDarkMode
                ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                : "bg-cyan-500/10 text-cyan-600 border border-cyan-500/20"
            }`}
          >
            {card.badge}
          </span>
        </div>
      )}

      {/* Icon */}
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
          isDarkMode ? "bg-white/[0.04]" : "bg-gray-50"
        }`}
      >
        <card.icon className={`${card.accent}`} size={18} />
      </div>

      {/* Title */}
      <h3
        className={`text-base font-bold mb-2 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {card.title}
      </h3>

      {/* Description */}
      <p
        className={`text-sm leading-relaxed mb-4 ${
          isDarkMode ? "text-gray-500" : "text-gray-500"
        }`}
      >
        {card.description}
      </p>

      {/* Link */}
      <span
        className={`text-xs font-semibold inline-flex items-center gap-1.5 ${card.accent} group-hover:gap-2.5 transition-all`}
      >
        Explore
        <span className="transition-transform group-hover:translate-x-1">
          &rarr;
        </span>
      </span>
    </motion.div>
  );

  if (card.external) {
    return (
      <a
        href={card.link}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {content}
      </a>
    );
  }

  return (
    <Link to={card.link} className="block h-full">
      {content}
    </Link>
  );
};

const EcosystemOverview = () => {
  const { isDarkMode } = useTheme();

  return (
    <section id="ecosystem" className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12 md:mb-16"
        >
          <h2
            className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display mb-4 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            The{" "}
            <span className="bg-gradient-to-r from-cyan-400 via-budju-blue to-budju-pink bg-clip-text text-transparent">
              Ecosystem
            </span>
          </h2>
          <p
            className={`text-base max-w-xl mx-auto ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            A complete DeFi suite built around the BUDJU trading bot. Trade,
            earn, burn, and collect.
          </p>
        </motion.div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {ecosystemCards.map((card, index) => (
            <EcosystemCardComponent
              key={card.title}
              card={card}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default EcosystemOverview;
