import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

const RemoveLiquidityGuide = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  const illustrationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && stepsRef.current) {
      const steps = stepsRef.current.querySelectorAll(".remove-step");

      // Animate steps on scroll
      gsap.fromTo(
        steps,
        {
          opacity: 0,
          y: 20,
        },
        {
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 80%",
          },
        },
      );

      // Animate illustration
      if (illustrationRef.current) {
        gsap.fromTo(
          illustrationRef.current,
          {
            opacity: 0,
            scale: 0.9,
          },
          {
            opacity: 1,
            scale: 1,
            duration: 0.6,
            ease: "back.out(1.7)",
            scrollTrigger: {
              trigger: illustrationRef.current,
              start: "top 80%",
            },
          },
        );
      }
    }
  }, []);

  return (
    <section
      id="remove-liquidity"
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
            <span className="text-white">Removing</span>{" "}
            <span className="text-budju-pink">Liquidity</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Learn how to withdraw your funds from BUDJU liquidity pools
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Left Column: Illustration */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            <div
              ref={illustrationRef}
              className="budju-card p-6 shadow-budju-lg"
            >
              <h3 className="text-xl font-bold text-white mb-6 text-center">
                Withdrawal Process
              </h3>

              {/* Interactive Illustration */}
              <div className="relative h-80 bg-gray-900/50 rounded-xl overflow-hidden border border-gray-700">
                {/* Pool Representation */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-budju-pink/30 to-budju-blue/30 border border-gray-700 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-gray-900/80 backdrop-blur-sm border-2 border-budju-blue flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-white">POOL</span>
                    <span className="text-xs text-budju-blue">SOL-BUDJU</span>
                  </div>
                </div>

                {/* Position Being Removed */}
                <div className="absolute inset-x-0 top-4 flex justify-center">
                  <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 shadow-lg max-w-xs">
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-1">
                        Your Position
                      </div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            SOL
                          </span>
                        </div>
                        <div className="text-white">0.5 SOL</div>
                        <span className="text-gray-400">+</span>
                        <div className="w-6 h-6 rounded-full bg-budju-pink flex items-center justify-center">
                          <span className="text-xs font-bold text-white">
                            B
                          </span>
                        </div>
                        <div className="text-white">2,150 BUDJU</div>
                      </div>
                      <div className="animate-pulse bg-budju-pink text-white text-xs py-1 px-3 rounded-full inline-block">
                        Removing...
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tokens Moving Animation */}
                <div className="absolute bottom-8 inset-x-0 flex justify-center">
                  <div className="bg-gray-800 rounded-lg p-3 border border-gray-700 shadow-lg w-64">
                    <div className="text-center">
                      <div className="text-sm text-gray-400 mb-1">
                        Returned to Your Wallet
                      </div>
                      <div className="text-white">0.5 SOL + 2,150 BUDJU</div>
                      <div className="text-xs text-green-400 mt-1">
                        + Earned Fees
                      </div>
                    </div>
                  </div>
                </div>

                {/* Animated Arrows */}
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 400 300"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M200 100 L200 200"
                    stroke="#FF69B4"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <path
                    d="M190 190 L200 200 L210 190"
                    stroke="#FF69B4"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              <div className="mt-6">
                <div className="bg-gray-800/50 p-4 rounded-lg">
                  <h4 className="text-white font-medium mb-2">
                    What Happens When You Remove Liquidity
                  </h4>
                  <ul className="space-y-2 text-gray-300 text-sm">
                    <li className="flex items-start">
                      <span className="text-budju-pink mr-2">•</span>
                      <span>
                        Your position is closed and both tokens return to your
                        wallet
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-budju-pink mr-2">•</span>
                      <span>
                        Any uncollected trading fees are also sent to your
                        wallet
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-budju-pink mr-2">•</span>
                      <span>You stop earning fees on this position</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column: Steps */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="order-1 lg:order-2"
          >
            <h3 className="text-2xl font-bold mb-6 text-budju-pink">
              Step-by-Step Removal Guide
            </h3>

            <div ref={stepsRef} className="space-y-6">
              <div className="remove-step budju-card p-6 border-budju-pink/30">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-budju-pink rounded-full flex items-center justify-center font-bold text-white mr-4">
                    1
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    Access Your Positions
                  </h4>
                </div>
                <p className="text-gray-300 ml-12">
                  Visit Raydium's{" "}
                  <a
                    href="https://raydium.io/clmm/positions/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-budju-pink hover:underline"
                  >
                    My Positions
                  </a>{" "}
                  page and connect your wallet to see all your active liquidity
                  positions.
                </p>
              </div>

              <div className="remove-step budju-card p-6 border-budju-pink/30">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-budju-pink rounded-full flex items-center justify-center font-bold text-white mr-4">
                    2
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    Find Your BUDJU Position
                  </h4>
                </div>
                <p className="text-gray-300 ml-12">
                  Locate your SOL-BUDJU or USDC-BUDJU position in the list. Make
                  sure to collect any earned fees before removing your liquidity
                  by clicking the "Collect Fees" button.
                </p>
              </div>

              <div className="remove-step budju-card p-6 border-budju-pink/30">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-budju-pink rounded-full flex items-center justify-center font-bold text-white mr-4">
                    3
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    Choose Removal Amount
                  </h4>
                </div>
                <p className="text-gray-300 ml-12 mb-3">
                  Click "Remove Liquidity" and choose how much of your position
                  you want to withdraw:
                </p>
                <div className="bg-gray-800/50 p-4 rounded-lg ml-12">
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-budju-pink mr-2">•</span>
                      <span>
                        <strong>Partial Removal:</strong> Use the slider to
                        select a percentage (25%, 50%, 75%, etc.)
                      </span>
                    </li>
                    <li className="flex items-start">
                      <span className="text-budju-pink mr-2">•</span>
                      <span>
                        <strong>Full Removal:</strong> Set the slider to 100% to
                        completely close your position
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="remove-step budju-card p-6 border-budju-pink/30">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-budju-pink rounded-full flex items-center justify-center font-bold text-white mr-4">
                    4
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    Confirm Withdrawal
                  </h4>
                </div>
                <p className="text-gray-300 ml-12">
                  Review the details, including how many tokens you'll receive
                  back, and click "Remove" to confirm. Approve the transaction
                  in your wallet when prompted.
                </p>
              </div>

              <div className="remove-step budju-card p-6 border-budju-pink/30">
                <div className="flex items-center mb-3">
                  <div className="w-8 h-8 bg-budju-pink rounded-full flex items-center justify-center font-bold text-white mr-4">
                    5
                  </div>
                  <h4 className="text-xl font-bold text-white">
                    Verify Returned Tokens
                  </h4>
                </div>
                <p className="text-gray-300 ml-12">
                  Once the transaction is confirmed, check your wallet to ensure
                  both tokens (SOL/USDC and BUDJU) have been returned, along
                  with any collected fees.
                </p>
              </div>
            </div>

            <div className="mt-8 bg-budju-pink/10 p-5 rounded-lg border border-budju-pink/30">
              <h4 className="text-white font-bold mb-2">
                Important Considerations
              </h4>
              <p className="text-gray-300 text-sm mb-3">
                When removing liquidity, be aware of the following:
              </p>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li className="flex items-start">
                  <span className="text-budju-pink mr-2">•</span>
                  <span>
                    Transaction fees are required to process the removal
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-pink mr-2">•</span>
                  <span>
                    The ratio of tokens you receive back may differ from what
                    you initially deposited due to price changes
                  </span>
                </li>
                <li className="flex items-start">
                  <span className="text-budju-pink mr-2">•</span>
                  <span>
                    Consider market conditions before removing - during high
                    volatility, you may want to wait for better prices
                  </span>
                </li>
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default RemoveLiquidityGuide;
