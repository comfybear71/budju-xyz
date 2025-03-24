import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { NFT_TARGET_HOLDERS } from "@constants/addresses";
import Button from "@components/common/Button";
import { particleBurst } from "@/lib/utils/animation";
import { useTheme } from "@/context/ThemeContext";
import { useTokenHolders } from "@/hooks/useTokenHolders";

const MintingCountdown = () => {
  const { isDarkMode } = useTheme();
  const { holders, loading } = useTokenHolders();
  const sectionRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const [currentHolders, setCurrentHolders] = useState<number | null>(null);

  // Update currentHolders when holders data is available
  useEffect(() => {
    if (!loading && holders !== null) {
      setCurrentHolders(holders);
    }
  }, [holders, loading]);

  // Calculate percentage progress, handling null case
  const progress = currentHolders !== null
    ? Math.min(100, Math.round((currentHolders / NFT_TARGET_HOLDERS) * 100))
    : 0;
  const holdersNeeded = currentHolders !== null ? NFT_TARGET_HOLDERS - currentHolders : NFT_TARGET_HOLDERS;

  // Progress bar animation
  useEffect(() => {
    if (counterRef.current) {
      gsap.to(counterRef.current.querySelector(".progress-bar-fill"), {
        width: `${progress}%`,
        duration: 1.5,
        ease: "power2.out",
      });

      if (progress >= 100 && sectionRef.current) {
        particleBurst(sectionRef.current, {
          count: 50,
          colors: ["#FF69B4", "#87CEFA", "#FFD700"],
          size: 12,
          duration: 2,
        });
      }
    }
  }, [progress]);

  return (
    <section ref={sectionRef} id="mint" className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-budju-pink">NFT</span>{" "}
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              MINTING
            </span>{" "}
            <span className="text-budju-blue">COUNTDOWN</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            The BUDJU NFT Collection will be available for minting once we reach{" "}
            {NFT_TARGET_HOLDERS.toLocaleString()} token holders. Join the community now to secure
            your chance to mint a unique BUDJU NFT!
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className={
              isDarkMode
                ? "bg-gray-800 border border-gray-700 rounded-xl p-8"
                : "bg-white/20 border border-white/30 rounded-xl shadow-lg p-8"
            }
          >
            {/* Countdown Display */}
            <div ref={counterRef} className="text-center">
              <div className="flex justify-between items-center mb-2">
                <span
                  className={isDarkMode ? "text-white" : "text-budju-white"}
                >
                  Holders Progress
                </span>
                <span className="text-budju-blue font-bold">
                  {loading
                    ? "Loading..."
                    : currentHolders !== null
                    ? `${currentHolders.toLocaleString()} / ${NFT_TARGET_HOLDERS.toLocaleString()}`
                    : "N/A"}
                </span>
              </div>

              {/* Progress Bar */}
              <div
                className={`h-6 ${isDarkMode ? "bg-gray-700" : "bg-white/30"} rounded-full overflow-hidden mb-4`}
              >
                <div
                  className="progress-bar-fill h-full bg-gradient-to-r from-budju-pink to-budju-blue transition-all duration-1000 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              {/* Status Message */}
              {progress < 100 ? (
                <div
                  className={`${isDarkMode ? "bg-gray-700/70" : "bg-white/30"} rounded-lg p-4 mb-8`}
                >
                  <p
                    className={`${isDarkMode ? "text-white" : "text-budju-white"} text-lg mb-2`}
                  >
                    <span className="text-budju-pink font-bold">
                      {loading
                        ? "Loading..."
                        : holdersNeeded.toLocaleString()}
                    </span>{" "}
                    more holders needed to unlock NFT minting!
                  </p>
                  <p className={isDarkMode ? "text-gray-300" : "text-white/80"}>
                    Buy and hold BUDJU tokens to be counted toward LAUNCH EVENT 🚀.
                  </p>
                  <p className={isDarkMode ? "text-gray-300" : "text-white/80"}>
                    NO NFT NO ENTRY 🛑 to BALI BUDJU PARTY 2025 @ LUNA BEACH CLUB{" "}
                    <span className="text-3xl">➡</span>
                    <a
                      href="https://www.facebook.com/share/16CAy3AaYQ/?mibextid=wwXIfr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-budju-pink hover:underline font-bold text-2xl"
                    >
                      EVENT
                    </a>
                    <span className="text-3xl">⬅</span>.
                  </p>
                </div>
              ) : (
                <div className="bg-budju-blue/20 rounded-lg p-4 mb-8">
                  <p
                    className={`${isDarkMode ? "text-white" : "text-budju-white"} text-lg mb-2`}
                  >
                    <span className="text-budju-blue font-bold">
                      NFT minting is now available!
                    </span>
                  </p>
                  <p className={isDarkMode ? "text-gray-300" : "text-white/80"}>
                    Connect your wallet to mint your unique BUDJU NFT.
                  </p>
                </div>
              )}

              {/* Mint Details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div
                  className={`${isDarkMode ? "bg-gray-700/50" : "bg-white/30"} p-4 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode ? "text-gray-300 mb-1" : "text-white/80 mb-1"
                    }
                  >
                    Mint Price
                  </div>
                  <div
                    className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"}`}
                  >
                    $250 USDC
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-700/50" : "bg-white/30"} p-4 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode ? "text-gray-300 mb-1" : "text-white/80 mb-1"
                    }
                  >
                    Collection Size
                  </div>
                  <div
                    className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"}`}
                  >
                    200 NFTs
                  </div>
                </div>

                <div
                  className={`${isDarkMode ? "bg-gray-700/50" : "bg-white/30"} p-4 rounded-lg`}
                >
                  <div
                    className={
                      isDarkMode ? "text-gray-300 mb-1" : "text-white/80 mb-1"
                    }
                  >
                    Max Per Wallet
                  </div>
                  <div
                    className={`text-2xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"}`}
                  >
                    5 NFTs
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <Button size="lg" disabled={progress < 100}>
                  {progress < 100 ? "Minting Coming Soon" : "Mint Now"}
                </Button>
                {/* <Button
                  variant="secondary"
                  size="lg"
                  as="link"
                  to="/how-to-buy"
                >
                  Buy BUDJU Tokens
                </Button> */}
              </div>
              <p className={`mt-4 ${isDarkMode ? "text-white" : "text-budju-white"}`}>
                **Mint will take place on Magic Eden
              </p>
            </div>
          </motion.div>

          <div
            className={`text-center mt-6 ${isDarkMode ? "text-gray-300" : "text-white/80"} text-sm`}
          >
            Holder count updates in real-time from the Solana blockchain. All
            BUDJU token holders will have priority access to the NFT mint.
          </div>
        </div>
      </div>
    </section>
  );
};

export default MintingCountdown;