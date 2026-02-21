import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaShoppingBag,
  FaCrown,
  FaWallet,
  FaShieldAlt,
} from "react-icons/fa";
import WalletConnect from "@components/common/WalletConnect";
import { useTheme } from "@/context/ThemeContext";
import { NFT_COLLECTION, getCollectionStats } from "../data/nftCollection";

const stats = getCollectionStats();

const highlights = [
  { icon: FaShoppingBag, label: "30 Unique NFTs", color: "text-budju-pink" },
  { icon: FaCrown, label: "Golden 1-of-1", color: "text-yellow-400" },
  { icon: FaWallet, label: "Pay BUDJU / USDC / SOL", color: "text-budju-blue" },
  { icon: FaShieldAlt, label: "On-chain Solana", color: "text-green-400" },
];

const NFTHero = () => {
  const { isDarkMode } = useTheme();
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (heroRef.current && titleRef.current && imagesRef.current) {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.fromTo(
        titleRef.current,
        { opacity: 0, y: -30 },
        { opacity: 1, y: 0, duration: 0.8 },
      );

      const nftImages = imagesRef.current.querySelectorAll("img");
      tl.fromTo(
        nftImages,
        { opacity: 0, scale: 0.8, y: 20 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          stagger: 0.12,
          duration: 0.6,
          ease: "back.out(1.7)",
        },
        "-=0.4",
      );

      nftImages.forEach((img, i) => {
        gsap.to(img, {
          y: 8 * (i % 2 ? 1 : -1),
          rotation: 4 * (i % 2 ? 1 : -1),
          duration: 2.2 + i * 0.2,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.1,
        });
      });
    }
  }, []);

  return (
    <section ref={heroRef} className="pt-24 pb-12 overflow-hidden px-4">
      <div className="max-w-7xl mx-auto relative">
        {/* Decorative blurs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-budju-pink/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-20 w-64 h-64 bg-budju-blue/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-yellow-400/[0.04] rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-center gap-10">
          {/* Text */}
          <div className="w-full lg:w-1/2 z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 mb-4">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-xs font-bold uppercase tracking-wider">
                  Marketplace Live
                </span>
              </div>

              <h1
                ref={titleRef}
                className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display mb-4 leading-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                BUDJU{" "}
                <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
                  NFT
                </span>{" "}
                Marketplace
              </h1>

              <p
                className={`text-base md:text-lg mb-6 leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
              >
                30 unique hand-crafted NFTs featuring our iconic BUDJU girl.
                From Common to the ultra-rare{" "}
                <span className="text-yellow-400 font-bold">Golden 1-of-1</span>
                . Buy with BUDJU, USDC, or SOL — all proceeds fund the Bank of
                BUDJU treasury.
              </p>

              {/* Highlights */}
              <div className="grid grid-cols-2 gap-2 mb-6">
                {highlights.map((h) => (
                  <div
                    key={h.label}
                    className={`flex items-center gap-2 p-2 rounded-lg ${isDarkMode ? "bg-white/[0.03]" : "bg-gray-50"}`}
                  >
                    <h.icon className={h.color} size={14} />
                    <span
                      className={`text-xs font-medium ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
                    >
                      {h.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href="#marketplace"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-budju-pink to-budju-blue hover:opacity-90 transition-opacity"
                >
                  <FaShoppingBag size={14} />
                  Browse Collection
                </a>
                <WalletConnect />
              </div>

              {/* Stats */}
              <div className="flex gap-6 mt-6">
                <div>
                  <div
                    className={`text-xl font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {stats.total}
                  </div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    Total NFTs
                  </div>
                </div>
                <div>
                  <div
                    className={`text-xl font-bold font-display ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}
                  >
                    ${stats.floorPrice}
                  </div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    Floor Price
                  </div>
                </div>
                <div>
                  <div
                    className={`text-xl font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    6
                  </div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                  >
                    Rarity Tiers
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Images */}
          <div
            ref={imagesRef}
            className="w-full lg:w-1/2 relative h-80 md:h-96 z-0"
          >
            <div className="absolute top-0 left-[5%] w-44 h-44 md:w-52 md:h-52">
              <img
                src="/images/budju00.png"
                alt="BUDJU NFT"
                className={`w-full h-full object-contain rounded-xl shadow-lg border-2 ${isDarkMode ? "border-white/[0.08]" : "border-gray-200/40"}`}
              />
            </div>
            <div className="absolute top-12 right-[5%] w-40 h-40 md:w-48 md:h-48">
              <img
                src="/images/budju01.png"
                alt="BUDJU NFT"
                className={`w-full h-full object-contain rounded-xl shadow-lg border-2 ${isDarkMode ? "border-white/[0.08]" : "border-gray-200/40"}`}
              />
            </div>
            <div className="absolute bottom-0 right-[15%] w-48 h-48 md:w-56 md:h-56">
              <img
                src="/images/budju02.png"
                alt="BUDJU NFT"
                className={`w-full h-full object-contain rounded-xl shadow-lg border-2 ${isDarkMode ? "border-white/[0.08]" : "border-gray-200/40"}`}
              />
            </div>
            <div className="absolute bottom-6 left-[10%] w-40 h-40 md:w-44 md:h-44">
              {/* Golden showcase teaser */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-yellow-300 to-amber-500 rounded-xl opacity-60 blur-[2px]" />
              <img
                src="/images/budju06.png"
                alt="BUDJU Golden NFT"
                className="relative w-full h-full object-contain rounded-xl shadow-lg border-2 border-yellow-400/40"
              />
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
                <FaCrown className="text-yellow-400" size={8} />
                <span className="text-yellow-400 text-[9px] font-bold">
                  GOLDEN
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default NFTHero;
