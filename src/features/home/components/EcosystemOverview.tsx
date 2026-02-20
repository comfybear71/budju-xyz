import { Link } from "react-router";
import { useInView } from "react-intersection-observer";
import {
  FaExchangeAlt,
  FaSwimmingPool,
  FaPiggyBank,
  FaBahai,
  FaShoppingCart,
  FaChartBar,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { ROUTES } from "@/constants/routes";

interface EcosystemCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  iconColor: string;
  link: string;
  external?: boolean;
}

const ecosystemCards: EcosystemCard[] = [
  {
    title: "Trading Board",
    description: "Swap tokens instantly on Solana with low fees and lightning-fast execution via Raydium.",
    icon: FaExchangeAlt,
    iconColor: "text-green-400",
    link: ROUTES.SWAP,
  },
  {
    title: "Liquidity Pools",
    description: "Provide liquidity and earn rewards. Explore SOL/BUDJU and USDC/BUDJU pool strategies.",
    icon: FaSwimmingPool,
    iconColor: "text-blue-400",
    link: ROUTES.POOL,
  },
  {
    title: "BUDJU Bank",
    description: "Track deposits, view transaction history, and monitor your BUDJU holdings in real time.",
    icon: FaPiggyBank,
    iconColor: "text-yellow-400",
    link: ROUTES.BANK,
  },
  {
    title: "NFT Collection",
    description: "Exclusive BUDJU NFTs with holder benefits. Mint, collect, and join the inner circle.",
    icon: FaBahai,
    iconColor: "text-purple-400",
    link: ROUTES.NFT,
  },
  {
    title: "BUDJU Shop",
    description: "Rep the brand with official BUDJU merchandise. Caps, tees, hoodies, and more.",
    icon: FaShoppingCart,
    iconColor: "text-budju-pink",
    link: "https://shop.budjucoin.com",
    external: true,
  },
  {
    title: "Tokenomics",
    description: "Live stats, supply breakdown, burn tracking, and real-time DexScreener integration.",
    icon: FaChartBar,
    iconColor: "text-cyan-400",
    link: ROUTES.TOKENOMICS,
  },
];

const EcosystemCard = ({
  card,
  index,
}: {
  card: EcosystemCard;
  index: number;
}) => {
  const { isDarkMode } = useTheme();
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const content = (
    <div
      ref={ref}
      className={`${isDarkMode ? "budju-card" : "budju-card-light"} p-6 h-full flex flex-col group`}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(30px)",
        transition: `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`,
      }}
    >
      {/* Icon */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
          isDarkMode ? "bg-white/5" : "bg-gray-900/5"
        }`}
      >
        <card.icon className={`${card.iconColor}`} size={24} />
      </div>

      {/* Title */}
      <h3
        className={`text-lg font-bold mb-2 ${
          isDarkMode ? "text-white" : "text-gray-900"
        }`}
      >
        {card.title}
      </h3>

      {/* Description */}
      <p
        className={`text-sm leading-relaxed mb-4 flex-grow ${
          isDarkMode ? "text-gray-400" : "text-gray-600"
        }`}
      >
        {card.description}
      </p>

      {/* Explore Link */}
      <span className="text-budju-pink font-medium text-sm inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        Explore
        <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
      </span>
    </div>
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
  const { ref: titleRef, inView: titleInView } = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section id="ecosystem" className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Title */}
        <div
          ref={titleRef}
          className="text-center mb-12 md:mb-16"
          style={{
            opacity: titleInView ? 1 : 0,
            transform: titleInView ? "translateY(0)" : "translateY(20px)",
            transition: "opacity 0.6s ease, transform 0.6s ease",
          }}
        >
          <h2
            className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display mb-4 ${
              isDarkMode ? "text-white" : "text-gray-900"
            }`}
          >
            The{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Ecosystem
            </span>
          </h2>
          <p
            className={`text-lg max-w-2xl mx-auto ${
              isDarkMode ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Everything you need in one place. Trade, earn, collect, and grow with BUDJU.
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {ecosystemCards.map((card, index) => (
            <EcosystemCard key={card.title} card={card} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default EcosystemOverview;
