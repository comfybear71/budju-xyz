import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaCoins,
  FaUserFriends,
  FaGift,
  FaLock,
  FaShoppingBag,
  FaChartLine,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

interface Benefit {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}

const benefits: Benefit[] = [
  {
    icon: FaCoins,
    title: "Token Airdrops",
    description:
      "Exclusive BUDJU token airdrops for NFT holders based on rarity level",
    color: "text-yellow-400",
  },
  {
    icon: FaUserFriends,
    title: "VIP Community Access",
    description: "Access to private community channels and priority support",
    color: "text-purple-400",
  },
  {
    icon: FaGift,
    title: "Merchandise Giveaways",
    description: "Regular giveaways of limited edition BUDJU merchandise",
    color: "text-green-400",
  },
  {
    icon: FaLock,
    title: "Early Access",
    description:
      "First access to new features, products, and future collections",
    color: "text-blue-400",
  },
  {
    icon: FaShoppingBag,
    title: "Shop Discounts",
    description: "Exclusive discounts in the BUDJU merchandise shop",
    color: "text-red-400",
  },
  {
    icon: FaChartLine,
    title: "Staking Rewards",
    description:
      "Higher APY when staking your BUDJU tokens in the Bank of BUDJU",
    color: "text-budju-pink",
  },
];

const rarityTiers = [
  {
    name: "Golden",
    pct: "1 of 1",
    color: "text-yellow-300",
    bg: "bg-yellow-400/10",
    border: "border-yellow-400/25",
    dot: "bg-gradient-to-r from-yellow-300 to-amber-500",
    desc: "All benefits at maximum level — 10x airdrops, exclusive 1-of-1 merch box, lifetime VIP event access, and permanent crown status",
  },
  {
    name: "Legendary",
    pct: "2 NFTs",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    dot: "bg-amber-500",
    desc: "All benefits at max level — 5x token airdrops, exclusive merchandise, and VIP events access",
  },
  {
    name: "Epic",
    pct: "4 NFTs",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    dot: "bg-purple-500",
    desc: "Enhanced benefits — 3x token airdrops, special merchandise access, and increased staking rewards",
  },
  {
    name: "Rare",
    pct: "5 NFTs",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    dot: "bg-blue-500",
    desc: "Improved benefits — 2x token airdrops, merchandise discounts, and community voting rights",
  },
  {
    name: "Uncommon",
    pct: "8 NFTs",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    dot: "bg-green-500",
    desc: "Standard benefits plus small bonus airdrops and early access to new features",
  },
  {
    name: "Common",
    pct: "10 NFTs",
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/20",
    dot: "bg-gray-500",
    desc: "Base level benefits including airdrops, community access, and merchandise giveaways",
  },
];

const NFTHolderBenefits = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".benefit-card");

      gsap.fromTo(
        cards,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.08,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Holder{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Benefits
            </span>
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Owning a BUDJU NFT unlocks exclusive perks. The rarer your NFT, the
            greater the rewards.
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12"
        >
          {benefits.map((benefit, i) => (
            <div
              key={i}
              className={`benefit-card p-4 rounded-xl border transition-all duration-300 hover:scale-[1.02] ${
                isDarkMode
                  ? "bg-[#0c0c20]/60 border-white/[0.06] hover:border-white/[0.12]"
                  : "bg-white/60 border-gray-200/40 hover:border-gray-300/60"
              } backdrop-blur-sm`}
            >
              <benefit.icon className={`${benefit.color} mb-3`} size={22} />
              <h3
                className={`text-sm font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {benefit.title}
              </h3>
              <p
                className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
              >
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Rarity Tiers */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h3
            className={`text-lg font-bold font-display text-center mb-6 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Rarity{" "}
            <span className="bg-gradient-to-r from-amber-400 to-budju-blue bg-clip-text text-transparent">
              Tiers
            </span>
          </h3>

          <div className="space-y-2">
            {rarityTiers.map((tier) => (
              <div
                key={tier.name}
                className={`p-3 rounded-lg border ${tier.bg} ${tier.border}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-3 h-3 rounded-full ${tier.dot} flex-shrink-0`}
                  />
                  <h4
                    className={`text-sm font-bold ${tier.color}`}
                  >
                    {tier.name}
                  </h4>
                  <span
                    className={`text-[10px] font-mono ml-auto ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    {tier.pct}
                  </span>
                </div>
                <p
                  className={`text-xs pl-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  {tier.desc}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        <p
          className={`text-center mt-6 text-[11px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
        >
          Benefits may expand as the BUDJU ecosystem grows. All holders receive
          core benefits regardless of rarity.
        </p>
      </div>
    </section>
  );
};

export default NFTHolderBenefits;
