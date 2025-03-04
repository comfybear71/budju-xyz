import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { POOL_SOL_BUDJU, POOL_USDC_BUDJU } from "@constants/addresses";

const AddLiquidityGuide = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (sectionRef.current && stepsRef.current) {
      const steps = stepsRef.current.querySelectorAll(".step-item");

      // Animate steps on scroll
      gsap.fromTo(
        steps,
        {
          opacity: 0,
          x: -30,
        },
        {
          opacity: 1,
          x: 0,
          stagger: 0.2,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 80%",
          },
        },
      );

      // Animate image
      if (imageRef.current) {
        gsap.fromTo(
          imageRef.current,
          {
            opacity: 0,
            scale: 0.8,
          },
          {
            opacity: 1,
            scale: 1,
            duration: 0.8,
            ease: "back.out(1.7)",
            scrollTrigger: {
              trigger: imageRef.current,
              start: "top 80%",
            },
          },
        );
      }
    }
  }, []);

  return (
    <section
      id="add-liquidity"
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
            <span className="text-budju-blue">How to Add</span>{" "}
            <span className="text-white">Liquidity</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Follow this step-by-step guide to become a BUDJU liquidity provider
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start max-w-5xl mx-auto">
          {/* Steps Column */}
          <div ref={stepsRef} className="space-y-8">
            {/* Step 1 */}
            <div className="step-item budju-card p-6 relative border-budju-blue/30">
              <div className="absolute -left-4 top-6 w-8 h-8 bg-budju-blue rounded-full flex items-center justify-center font-bold text-white">
                1
              </div>
              <h3 className="text-xl font-bold text-white mb-3 ml-6">
                Connect Your Wallet
              </h3>
              <p className="text-gray-300 mb-4">
                Visit{" "}
                <a
                  href="https://raydium.io/clmm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-budju-blue hover:underline"
                >
                  Raydium's Concentrated Liquidity
                </a>{" "}
                page and connect your Solana wallet (like Phantom or Jupiter).
              </p>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <p className="text-gray-400 text-sm">
                  Make sure your wallet has both SOL (for transaction fees) and
                  the tokens you want to provide as liquidity (BUDJU and
                  SOL/USDC).
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="step-item budju-card p-6 relative border-budju-blue/30">
              <div className="absolute -left-4 top-6 w-8 h-8 bg-budju-blue rounded-full flex items-center justify-center font-bold text-white">
                2
              </div>
              <h3 className="text-xl font-bold text-white mb-3 ml-6">
                Select the Pool
              </h3>
              <p className="text-gray-300 mb-4">
                Choose either the SOL-BUDJU or USDC-BUDJU pool from the list, or
                use the provided direct links below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <Button
                  as="a"
                  href={`https://raydium.io/clmm/create-position/?pool_id=${POOL_SOL_BUDJU}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="sm"
                >
                  SOL-BUDJU Pool
                </Button>
                <Button
                  as="a"
                  href={`https://raydium.io/clmm/create-position/?pool_id=${POOL_USDC_BUDJU}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="secondary"
                  size="sm"
                >
                  USDC-BUDJU Pool
                </Button>
              </div>
            </div>

            {/* Step 3 */}
            <div className="step-item budju-card p-6 relative border-budju-blue/30">
              <div className="absolute -left-4 top-6 w-8 h-8 bg-budju-blue rounded-full flex items-center justify-center font-bold text-white">
                3
              </div>
              <h3 className="text-xl font-bold text-white mb-3 ml-6">
                Set Your Price Range
              </h3>
              <p className="text-gray-300 mb-4">
                Define the price range for your position. This is the range
                where your liquidity will be active and earn fees.
              </p>
              <div className="bg-budju-pink/10 p-3 rounded-lg border border-budju-pink/30">
                <p className="text-white text-sm">
                  <span className="font-bold text-budju-pink">Pro Tip:</span>{" "}
                  For beginners, use the "Preset Ranges" like "Standard" or
                  "Safer" to automatically set reasonable ranges. More
                  experienced users can set custom ranges.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="step-item budju-card p-6 relative border-budju-blue/30">
              <div className="absolute -left-4 top-6 w-8 h-8 bg-budju-blue rounded-full flex items-center justify-center font-bold text-white">
                4
              </div>
              <h3 className="text-xl font-bold text-white mb-3 ml-6">
                Deposit Tokens
              </h3>
              <p className="text-gray-300 mb-4">
                Enter the amount of tokens you want to provide. You can:
              </p>
              <ul className="space-y-2 mb-4">
                <li className="flex items-start">
                  <span className="text-budju-blue mr-2">•</span>
                  <span className="text-gray-300">
                    Input a specific amount of one token, and the interface will
                    calculate the required amount of the other token
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-blue mr-2">•</span>
                  <span className="text-gray-300">
                    Use the "Max" button to provide the maximum amount available
                    in your wallet
                  </span>
                </li>
              </ul>
            </div>

            {/* Step 5 */}
            <div className="step-item budju-card p-6 relative border-budju-blue/30">
              <div className="absolute -left-4 top-6 w-8 h-8 bg-budju-blue rounded-full flex items-center justify-center font-bold text-white">
                5
              </div>
              <h3 className="text-xl font-bold text-white mb-3 ml-6">
                Confirm and Create Position
              </h3>
              <p className="text-gray-300 mb-4">
                Review your position details and click "Create Position" to
                confirm. Your wallet will prompt you to approve the transaction.
              </p>
              <div className="bg-gray-800/50 p-3 rounded-lg">
                <p className="text-gray-400 text-sm">
                  Once the transaction is confirmed on the Solana blockchain,
                  your position will be active and will start earning fees when
                  trades occur within your price range.
                </p>
              </div>
            </div>
          </div>

          {/* Visual/Image Column */}
          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="budju-card p-6"
            >
              <h3 className="text-xl font-bold text-white mb-4">
                Position Visualization
              </h3>

              {/* Mock interface showing concentrated liquidity position creation */}
              <div
                ref={imageRef}
                className="rounded-xl overflow-hidden border border-gray-700 bg-black"
              >
                <div className="bg-gray-900 p-3 border-b border-gray-800">
                  <div className="flex items-center">
                    <div className="flex -space-x-2 mr-3">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center z-10">
                        <span className="text-xs font-bold text-white">
                          SOL
                        </span>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-budju-pink flex items-center justify-center">
                        <span className="text-xs font-bold text-white">
                          BUDJU
                        </span>
                      </div>
                    </div>
                    <span className="font-bold text-white">
                      Create Position: SOL-BUDJU
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  {/* Price Range Selection */}
                  <div className="mb-6">
                    <div className="text-sm text-gray-400 mb-2">
                      Price Range
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 bg-gray-800 rounded-lg p-2 mr-2">
                        <div className="text-xs text-gray-400">Min Price</div>
                        <div className="text-white">0.00018</div>
                      </div>
                      <div className="flex-1 bg-gray-800 rounded-lg p-2 ml-2">
                        <div className="text-xs text-gray-400">Max Price</div>
                        <div className="text-white">0.00032</div>
                      </div>
                    </div>
                  </div>

                  {/* Token Input Fields */}
                  <div className="mb-6">
                    <div className="text-sm text-gray-400 mb-2">
                      Deposit Amounts
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 mb-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center mr-2">
                            <span className="text-xs font-bold text-white">
                              SOL
                            </span>
                          </div>
                          <span className="text-white">SOL</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          Balance: 12.45
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-white">0.5</div>
                        <div className="text-xs text-budju-blue">MAX</div>
                      </div>
                    </div>

                    <div className="bg-gray-800 rounded-lg p-3">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-budju-pink flex items-center justify-center mr-2">
                            <span className="text-xs font-bold text-white">
                              B
                            </span>
                          </div>
                          <span className="text-white">BUDJU</span>
                        </div>
                        <div className="text-xs text-gray-400">
                          Balance: 25,420.89
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <div className="text-white">2,150.65</div>
                        <div className="text-xs text-budju-blue">MAX</div>
                      </div>
                    </div>
                  </div>

                  {/* Create Position Button */}
                  <div className="bg-budju-pink hover:bg-budju-pink-dark text-white font-bold py-3 px-4 rounded-lg text-center cursor-pointer transition-colors duration-300">
                    Create Position
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Tips Box */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="budju-card p-6 bg-gradient-to-br from-gray-900 to-gray-800"
            >
              <h3 className="text-xl font-bold text-budju-pink mb-4">
                Liquidity Provider Tips
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start">
                  <span className="text-budju-pink mr-3 text-xl">🔍</span>
                  <div>
                    <span className="text-white font-medium">
                      Research Before Providing
                    </span>
                    <p className="text-gray-300 text-sm">
                      Understand BUDJU's recent price action to set appropriate
                      ranges.
                    </p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-pink mr-3 text-xl">⚖️</span>
                  <div>
                    <span className="text-white font-medium">
                      Balance Risk and Reward
                    </span>
                    <p className="text-gray-300 text-sm">
                      Wider ranges are safer but earn less; narrower ranges earn
                      more but require active management.
                    </p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-pink mr-3 text-xl">📊</span>
                  <div>
                    <span className="text-white font-medium">Start Small</span>
                    <p className="text-gray-300 text-sm">
                      Begin with a smaller amount until you're comfortable with
                      the process.
                    </p>
                  </div>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-pink mr-3 text-xl">⏱️</span>
                  <div>
                    <span className="text-white font-medium">
                      Monitor Regularly
                    </span>
                    <p className="text-gray-300 text-sm">
                      Check your positions periodically to ensure they remain in
                      range.
                    </p>
                  </div>
                </li>
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AddLiquidityGuide;
