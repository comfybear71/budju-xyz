import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

const HarvestRewards = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && animatedRef.current) {
      // Create animation for the rewards graphic
      gsap.fromTo(
        animatedRef.current.querySelectorAll(".reward-coin"),
        {
          y: -5,
          opacity: 0.7,
        },
        {
          y: 5,
          opacity: 1,
          stagger: 0.2,
          duration: 1.5,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        },
      );
    }
  }, []);

  return (
    <section
      id="harvest-rewards"
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">Harvest</span>{" "}
            <span className="text-budju-pink">Rewards</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Learn how to collect your earnings as a BUDJU liquidity provider
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Rewards Animation */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <div
              ref={animatedRef}
              className="relative h-64 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-8 shadow-budju border border-gray-700 overflow-hidden"
            >
              {/* Liquidity Pool in Center */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-gray-800/80 backdrop-blur-sm flex items-center justify-center border-4 border-budju-blue z-10">
                <span className="text-xl font-bold text-white">POOL</span>
              </div>

              {/* Reward Coins - These will be animated */}
              <div className="reward-coin absolute top-1/4 left-1/4 w-12 h-12 rounded-full bg-budju-pink flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">FEES</span>
              </div>
              <div className="reward-coin absolute top-2/3 left-1/3 w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">$</span>
              </div>
              <div className="reward-coin absolute top-1/3 right-1/4 w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">REWARD</span>
              </div>
              <div className="reward-coin absolute bottom-1/4 right-1/3 w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">APR</span>
              </div>

              {/* Glow effects */}
              <div className="absolute inset-0 bg-gradient-to-r from-budju-pink/10 to-budju-blue/10 opacity-50"></div>
            </div>
          </motion.div>

          {/* Rewards Text Content */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="order-1 lg:order-2"
          >
            <h3 className="text-2xl font-bold mb-6 text-budju-blue">
              Earning & Harvesting Rewards
            </h3>

            <div className="space-y-6">
              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  Types of Rewards
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-budju-pink mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Trading Fees
                      </span>
                      <p className="text-gray-400">
                        Earn 0.25% fees from all trades that occur in the pool
                        proportional to your share of liquidity.
                      </p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="text-budju-blue mr-2 text-xl">•</span>
                    <div>
                      <span className="font-medium text-white">
                        Price Range Optimization
                      </span>
                      <p className="text-gray-400">
                        Concentrated liquidity positions earn higher fees when
                        trading occurs within your chosen price range.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-5 border border-gray-800">
                <h4 className="text-xl font-semibold text-white mb-3">
                  How to Harvest
                </h4>
                <ol className="space-y-3">
                  <li className="flex">
                    <span className="text-budju-pink mr-3 font-bold">1.</span>
                    <p className="text-gray-300">
                      Visit Raydium and connect the wallet containing your
                      liquidity position
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-pink mr-3 font-bold">2.</span>
                    <p className="text-gray-300">
                      Navigate to "My Positions" to see all your active
                      liquidity positions
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-pink mr-3 font-bold">3.</span>
                    <p className="text-gray-300">
                      For each position, you'll see accumulated fees that can be
                      collected
                    </p>
                  </li>
                  <li className="flex">
                    <span className="text-budju-pink mr-3 font-bold">4.</span>
                    <p className="text-gray-300">
                      Click "Collect Fees" to claim your earned trading fees
                    </p>
                  </li>
                </ol>
              </div>

              <div className="bg-budju-pink/10 rounded-lg p-5 border border-budju-pink/30">
                <h4 className="text-xl font-semibold text-white mb-3">
                  Maximizing Your Rewards
                </h4>
                <p className="text-gray-300 mb-3">
                  The key to maximizing your earnings is setting the right price
                  range for your liquidity. Narrower ranges can yield higher
                  returns but require more active management.
                </p>
                <p className="text-gray-300">
                  Monitor market conditions and be ready to adjust your position
                  to keep your liquidity active in the optimal trading range.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HarvestRewards;
