import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { useTheme } from "@/context/ThemeContext";

const PoolIntro = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && animatedRef.current) {
      // Create animation for the pool graphic
      gsap.fromTo(
        animatedRef.current,
        {
          rotationY: -10,
          rotationX: 5,
        },
        {
          rotationY: 10,
          rotationX: -5,
          duration: 4,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-20">
      <div className="budju-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Pool Description */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              <span className="text-budju-blue">Why Pools </span>
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                Matter
              </span>
            </h2>

            <div
              className={`space-y-4 text-lg ${isDarkMode ? "text-gray-300" : "text-white"}`}
            >
              <p>
                Liquidity pools are the backbone of decentralized exchanges,
                enabling seamless trading without traditional order books or
                centralized parties.
              </p>

              <p className="font-semibold">
                By providing liquidity to BUDJU pools, community members become
                market makers, earning rewards while supporting the project's
                growth and stability.
              </p>

              <p>
                The BUDJU ecosystem features two key pools: SOL-BUDJU and
                USDC-BUDJU. These pools provide essential trading liquidity,
                reduce price slippage, and create a sustainable ecosystem where
                all participants can benefit.
              </p>

              <div
                className={`mt-8 ${isDarkMode ? "bg-gray-900/50 border-gray-800" : "bg-white/20 border-white/30"} rounded-xl border p-6`}
              >
                <h3 className="text-xl font-bold mb-4 text-budju-pink">
                  Benefits of Providing Liquidity
                </h3>

                <ul className="space-y-2">
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2">•</span>
                    <span>
                      Earn trading fees from all transactions in the pool
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2">•</span>
                    <span>Support BUDJU's growth and market stability</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2">•</span>
                    <span>
                      Participate in concentrated liquidity positions for
                      potentially higher returns
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2">•</span>
                    <span>Become an essential part of the BUDJU ecosystem</span>
                  </li>
                </ul>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <Button as="a" href="#pool-stats" variant="secondary">
                    View Pool Stats
                  </Button>

                  <Button as="a" href="#add-liquidity">
                    How to Add Liquidity
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Animated Pool Graphic */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex justify-center"
          >
            <div
              ref={animatedRef}
              className={`relative ${isDarkMode ? "bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700" : "bg-gradient-to-br from-budju-pink-light to-budju-blue-light border-white/30"} rounded-xl p-8 shadow-budju border max-w-md transform perspective-1000`}
            >
              {/* Pool Graphic - Visualization of liquidity pool */}
              <div className="relative h-64 rounded-lg overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-budju-pink to-budju-blue opacity-30"></div>

                {/* BUDJU token symbol */}
                <div className="absolute top-8 left-10 w-24 h-24 rounded-full bg-budju-pink flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">BUDJU</span>
                </div>

                {/* SOL token symbol */}
                <div className="absolute bottom-8 right-10 w-24 h-24 rounded-full bg-purple-600 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">SOL</span>
                </div>

                {/* Connection lines representing pool */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 rounded-full bg-gray-800/80 backdrop-blur-sm flex items-center justify-center border-4 border-budju-blue">
                    <span className="text-xl font-bold text-white">POOL</span>
                  </div>
                </div>
              </div>

              {/* Pool Stats Preview */}
              <div
                className={`mt-6 ${isDarkMode ? "bg-gray-900/80" : "bg-white/30"} backdrop-blur-sm rounded-lg p-4 ${isDarkMode ? "border-gray-700" : "border-white/30"} border`}
              >
                <div
                  className={
                    isDarkMode
                      ? "text-sm text-gray-400 mb-1"
                      : "text-sm text-white/80 mb-1"
                  }
                >
                  Current TVL
                </div>
                <div className="text-xl font-bold text-budju-pink">
                  $247,890
                </div>
                <div
                  className={
                    isDarkMode
                      ? "text-sm text-gray-400 mt-2"
                      : "text-sm text-white/80 mt-2"
                  }
                >
                  24h Volume
                </div>
                <div className="text-budju-blue font-medium">$42,156</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* How Pools Work */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold mb-6 text-center">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              How{" "}
            </span>
            <span className="text-budju-pink">Pools Work</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              className={
                isDarkMode
                  ? "budju-card p-6 text-center"
                  : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
              }
            >
              <div className="w-16 h-16 bg-budju-pink/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💧</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Provide Liquidity
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Deposit pairs of tokens (BUDJU+SOL or BUDJU+USDC) into the pool,
                creating the liquidity that enables trading.
              </p>
            </div>

            <div
              className={
                isDarkMode
                  ? "budju-card p-6 text-center"
                  : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
              }
            >
              <div className="w-16 h-16 bg-budju-blue/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔄</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Enable Trading
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Your deposited tokens allow others to swap between BUDJU and
                other assets with minimal slippage.
              </p>
            </div>

            <div
              className={
                isDarkMode
                  ? "budju-card p-6 text-center"
                  : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-6 text-center"
              }
            >
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Earn Rewards
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Collect trading fees from every swap that occurs in the pool
                proportional to your share of the liquidity.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default PoolIntro;
