import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { useTheme } from "@/context/ThemeContext";

// Pool addresses
const POOLS = {
  SOL_BUDJU: {
    name: "SOL-BUDJU Pool",
    address: "D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka",
    url: "https://raydium.io/clmm/create-position/?pool_id=D61kHQmy8UxD6ks9L6dsponk5yexomBLdG5QaFxaHYka",
    description:
      "Provide liquidity between SOL and BUDJU tokens to earn trading fees and support the ecosystem.",
    tokenA: "SOL",
    tokenB: "BUDJU",
    colorA: "bg-purple-600",
    colorB: "bg-budju-pink",
  },
  USDC_BUDJU: {
    name: "USDC-BUDJU Pool",
    address: "HJjgx74kiUK7WnDXppj7DaCu1VmNGRWXb2RakmSRvZXC",
    url: "https://raydium.io/clmm/create-position/?pool_id=HJjgx74kiUK7WnDXppj7DaCu1VmNGRWXb2RakmSRvZXC",
    description:
      "Provide liquidity between USDC and BUDJU tokens for stablecoin trading pairs and reduced volatility.",
    tokenA: "USDC",
    tokenB: "BUDJU",
    colorA: "bg-blue-500",
    colorB: "bg-budju-pink",
  },
};

const PoolLinks = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".pool-card");

      // Animate cards on scroll
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
          scale: 0.95,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.2,
          duration: 0.6,
          ease: "back.out(1.7)",
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
    <section id="pool-links" ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              Join the
            </span>{" "}
            <span className="text-budju-blue">BUDJU Pools</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Connect directly to Raydium and provide liquidity to these official
            BUDJU pools
          </p>
        </motion.div>

        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto"
        >
          {/* SOL-BUDJU Pool Card */}
          <div
            className={`pool-card ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 relative overflow-hidden border-purple-600/50`}
          >
            {/* Background decoration */}
            <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-purple-600/20 blur-xl"></div>
            <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-budju-pink/20 blur-xl"></div>

            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center z-10">
                    <span className="text-sm font-bold text-white">SOL</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-budju-pink flex items-center justify-center">
                    <span className="text-sm font-bold text-white">BUDJU</span>
                  </div>
                </div>
                <h3
                  className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} ml-3`}
                >
                  SOL-BUDJU Pool
                </h3>
              </div>

              <p
                className={
                  isDarkMode ? "text-gray-300 mb-4" : "text-white mb-4"
                }
              >
                {POOLS.SOL_BUDJU.description}
              </p>

              <div
                className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg mb-4`}
              >
                <div
                  className={`mb-1 ${isDarkMode ? "text-gray-400" : "text-white/80"} text-xs`}
                >
                  Pool Address:
                </div>
                <div className="flex items-center">
                  <code
                    className={`text-xs ${isDarkMode ? "text-gray-300" : "text-white"} font-mono truncate flex-1`}
                  >
                    {POOLS.SOL_BUDJU.address}
                  </code>
                  <CopyToClipboard text={POOLS.SOL_BUDJU.address} />
                </div>
              </div>

              <Button
                as="a"
                href={POOLS.SOL_BUDJU.url}
                target="_blank"
                rel="noopener noreferrer"
                fullWidth
                className="bg-gradient-to-r from-purple-600 to-budju-pink"
              >
                Join SOL-BUDJU Pool
              </Button>
            </div>
          </div>

          {/* USDC-BUDJU Pool Card */}
          <div
            className={`pool-card ${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 relative overflow-hidden border-blue-500/50`}
          >
            {/* Background decoration */}
            <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-blue-500/20 blur-xl"></div>
            <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-budju-pink/20 blur-xl"></div>

            <div className="relative">
              <div className="flex items-center mb-4">
                <div className="flex -space-x-2">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center z-10">
                    <span className="text-sm font-bold text-white">USDC</span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-budju-pink flex items-center justify-center">
                    <span className="text-sm font-bold text-white">BUDJU</span>
                  </div>
                </div>
                <h3
                  className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} ml-3`}
                >
                  USDC-BUDJU Pool
                </h3>
              </div>

              <p
                className={
                  isDarkMode ? "text-gray-300 mb-4" : "text-white mb-4"
                }
              >
                {POOLS.USDC_BUDJU.description}
              </p>

              <div
                className={`${isDarkMode ? "bg-gray-800/50" : "bg-white/30"} p-3 rounded-lg mb-4`}
              >
                <div
                  className={`mb-1 ${isDarkMode ? "text-gray-400" : "text-white/80"} text-xs`}
                >
                  Pool Address:
                </div>
                <div className="flex items-center">
                  <code
                    className={`text-xs ${isDarkMode ? "text-gray-300" : "text-white"} font-mono truncate flex-1`}
                  >
                    {POOLS.USDC_BUDJU.address}
                  </code>
                  <CopyToClipboard text={POOLS.USDC_BUDJU.address} />
                </div>
              </div>

              <Button
                as="a"
                href={POOLS.USDC_BUDJU.url}
                target="_blank"
                rel="noopener noreferrer"
                fullWidth
                className="bg-gradient-to-r from-blue-500 to-budju-pink"
              >
                Join USDC-BUDJU Pool
              </Button>
            </div>
          </div>
        </div>

        <div
          className={`text-center mt-8 ${isDarkMode ? "text-gray-400" : "text-white/80"} text-sm max-w-2xl mx-auto`}
        >
          <p>
            These pools are hosted on Raydium's concentrated liquidity market
            maker (CLMM) protocol. Always verify pool addresses before providing
            liquidity.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PoolLinks;
