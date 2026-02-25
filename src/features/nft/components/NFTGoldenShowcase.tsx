import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaCrown, FaStar, FaGem, FaShieldAlt } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { NFT_COLLECTION, RARITY_CONFIG } from "../data/nftCollection";
import NFTDetailModal from "./NFTDetailModal";
import { AnimatePresence } from "motion/react";

const goldenNFT = NFT_COLLECTION.find((n) => n.rarity === "Golden")!;

const goldenPerks = [
  {
    icon: FaCrown,
    title: "Ultimate Status",
    desc: "Crown holder in the BUDJU community with permanent VIP recognition",
  },
  {
    icon: FaStar,
    title: "10x Airdrops",
    desc: "Receive 10x the standard token airdrop allocation on every drop",
  },
  {
    icon: FaGem,
    title: "Exclusive Merch",
    desc: "One-of-a-kind golden merchandise box delivered to your door",
  },
  {
    icon: FaShieldAlt,
    title: "Lifetime Access",
    desc: "Permanent entry to all BUDJU events, parties, and future launches",
  },
];

const NFTGoldenShowcase = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (imageRef.current) {
      // Floating golden glow animation
      gsap.to(imageRef.current, {
        y: -8,
        duration: 2.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }
  }, []);

  return (
    <>
      <section ref={sectionRef} className="py-16 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-400/[0.04] rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-400/10 border border-yellow-400/20 mb-4">
              <FaCrown className="text-yellow-400" size={12} />
              <span className="text-yellow-400 text-xs font-bold uppercase tracking-wider">
                Highest Rarity — 1 of 1
              </span>
              <FaCrown className="text-yellow-400" size={12} />
            </div>
            <h2
              className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              The{" "}
              <span className="bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                Golden
              </span>{" "}
              NFT
            </h2>
            <p
              className={`text-sm max-w-lg mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
            >
              Only one exists in the entire collection. The ultimate
              BUDJU collectible with exclusive perks that no other NFT offers.
            </p>
          </motion.div>

          {/* Main showcase */}
          <div className="flex flex-col lg:flex-row items-center gap-10">
            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="w-full lg:w-1/2"
            >
              <div
                ref={imageRef}
                className="relative max-w-sm mx-auto cursor-pointer group"
                onClick={() => setShowDetail(true)}
              >
                {/* Golden ring effect */}
                <div className="absolute -inset-1 bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-600 rounded-2xl opacity-60 blur-sm group-hover:opacity-80 transition-opacity" />

                <div className="relative rounded-2xl overflow-hidden border-2 border-yellow-400/40">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/15 via-transparent to-amber-600/15 z-10 pointer-events-none" />
                  <img
                    src={goldenNFT.image}
                    alt={goldenNFT.name}
                    className="w-full aspect-square object-cover transition-transform duration-700 group-hover:scale-105"
                  />

                  {/* Golden badge */}
                  <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold shadow-lg shadow-yellow-400/30">
                    <FaCrown size={10} /> GOLDEN
                  </div>

                  {/* Price tag */}
                  <div className="absolute bottom-3 right-3 z-20 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm">
                    <div className="text-yellow-400 text-lg font-bold font-display">
                      ${goldenNFT.price.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Click hint */}
                <div
                  className={`text-center mt-3 text-xs ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  Click to view details & purchase
                </div>
              </div>
            </motion.div>

            {/* Perks */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="w-full lg:w-1/2"
            >
              <h3
                className={`text-lg font-bold font-display mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {goldenNFT.name}
              </h3>
              <p
                className={`text-sm mb-6 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
              >
                {goldenNFT.description}
              </p>

              <div
                className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? "text-yellow-400/60" : "text-amber-600/60"}`}
              >
                Golden Holder Perks
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {goldenPerks.map((perk) => (
                  <div
                    key={perk.title}
                    className={`p-3 rounded-xl border transition-all hover:scale-[1.02] ${
                      isDarkMode
                        ? "bg-yellow-400/[0.03] border-yellow-400/10 hover:border-yellow-400/25"
                        : "bg-yellow-50/60 border-yellow-200/40 hover:border-yellow-300/60"
                    }`}
                  >
                    <perk.icon className="text-yellow-400 mb-2" size={18} />
                    <div
                      className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {perk.title}
                    </div>
                    <div
                      className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
                    >
                      {perk.desc}
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <button
                onClick={() => setShowDetail(true)}
                className="mt-6 w-full py-3 rounded-xl text-sm font-bold text-black bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 hover:from-yellow-400 hover:via-amber-500 hover:to-yellow-600 transition-all shadow-lg shadow-yellow-400/20"
              >
                <FaCrown className="inline mr-2" size={14} />
                View & Purchase the Golden NFT
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {showDetail && (
          <NFTDetailModal
            nft={goldenNFT}
            onClose={() => setShowDetail(false)}
            liked={liked}
            onLike={() => setLiked(!liked)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default NFTGoldenShowcase;
