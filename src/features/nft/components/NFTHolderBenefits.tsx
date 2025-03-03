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

// Benefit interface
interface Benefit {
  icon: React.ElementType;
  title: string;
  description: string;
  color: string;
}

// Benefits array
const benefits: Benefit[] = [
  {
    icon: FaCoins,
    title: "Token Airdrops",
    description:
      "Exclusive BUDJU token airdrops for NFT holders based on rarity level",
    color: "bg-yellow-500",
  },
  {
    icon: FaUserFriends,
    title: "VIP Community Access",
    description: "Access to private community channels and priority support",
    color: "bg-purple-500",
  },
  {
    icon: FaGift,
    title: "Merchandise Giveaways",
    description: "Regular giveaways of limited edition BUDJU merchandise",
    color: "bg-green-500",
  },
  {
    icon: FaLock,
    title: "Early Access",
    description:
      "First access to new features, products, and future collections",
    color: "bg-blue-500",
  },
  {
    icon: FaShoppingBag,
    title: "Shop Discounts",
    description: "Exclusive discounts in the BUDJU merchandise shop",
    color: "bg-red-500",
  },
  {
    icon: FaChartLine,
    title: "Staking Rewards",
    description:
      "Higher APY when staking your BUDJU tokens in the Bank of BUDJU",
    color: "bg-budju-pink",
  },
];

const NFTHolderBenefits = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".benefit-card");

      // Animate cards on scroll
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          stagger: 0.1,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 80%",
          },
        },
      );

      // Add hover effects
      cards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
          gsap.to(card, {
            y: -10,
            boxShadow: "0 15px 30px rgba(0, 0, 0, 0.3)",
            duration: 0.3,
          });
        });

        card.addEventListener("mouseleave", () => {
          gsap.to(card, {
            y: 0,
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            duration: 0.5,
            ease: "elastic.out(1, 0.5)",
          });
        });
      });
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-gray-900 to-budju-black"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">HOLDER</span>{" "}
            <span className="text-budju-pink">BENEFITS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Owning a BUDJU NFT comes with exclusive benefits and rewards. The
            rarer your NFT, the greater your benefits!
          </p>
        </motion.div>

        {/* Benefits Grid */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="benefit-card budju-card overflow-hidden hover:border-gray-600 transition-all duration-300"
            >
              <div className="p-6">
                {/* Icon with colored background */}
                <div
                  className={`w-16 h-16 rounded-full ${benefit.color} flex items-center justify-center mb-4`}
                >
                  <benefit.icon size={28} className="text-white" />
                </div>

                {/* Benefit Title */}
                <h3 className="text-xl font-bold text-white mb-3">
                  {benefit.title}
                </h3>

                {/* Benefit Description */}
                <p className="text-gray-400">{benefit.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Rarity Tiers */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-16 max-w-4xl mx-auto"
        >
          <h3 className="text-2xl font-bold text-center mb-8">
            <span className="text-budju-blue">RARITY</span>{" "}
            <span className="text-white">TIERS</span>
          </h3>

          <div className="space-y-4">
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-yellow-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-bold text-white">Legendary (1%)</h4>
              </div>
              <p className="text-gray-300 pl-7">
                All benefits at maximum level, including 5x token airdrops,
                exclusive merchandise, and VIP events access
              </p>
            </div>

            <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-purple-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-bold text-white">Epic (4%)</h4>
              </div>
              <p className="text-gray-300 pl-7">
                Enhanced benefits with 3x token airdrops, special merchandise
                access, and increased staking rewards
              </p>
            </div>

            <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-bold text-white">Rare (10%)</h4>
              </div>
              <p className="text-gray-300 pl-7">
                Improved benefits with 2x token airdrops, merchandise discounts,
                and community voting rights
              </p>
            </div>

            <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-green-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-bold text-white">Uncommon (25%)</h4>
              </div>
              <p className="text-gray-300 pl-7">
                Standard benefits plus small bonus airdrops and early access to
                new features
              </p>
            </div>

            <div className="bg-gray-500/20 border border-gray-500/30 rounded-lg p-4">
              <div className="flex items-center mb-2">
                <div className="w-4 h-4 bg-gray-500 rounded-full mr-3"></div>
                <h4 className="text-xl font-bold text-white">Common (60%)</h4>
              </div>
              <p className="text-gray-300 pl-7">
                Base level benefits including airdrops, community access, and
                merchandise giveaways
              </p>
            </div>
          </div>
        </motion.div>

        <div className="text-center mt-10 text-gray-400 text-sm max-w-2xl mx-auto">
          Benefits are subject to change and may be expanded as the BUDJU
          ecosystem grows. All NFT holders, regardless of rarity, will receive
          the core benefits listed above.
        </div>
      </div>
    </section>
  );
};

export default NFTHolderBenefits;
