import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { BANK_ADDRESS } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";

const BankIntro = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && animatedRef.current) {
      // Create animation for the bank vault image
      gsap.fromTo(
        animatedRef.current,
        {
          rotationY: -20,
          rotationX: 10,
        },
        {
          rotationY: 20,
          rotationX: -10,
          duration: 5,
          ease: "sine.inOut",
          repeat: -1,
          yoyo: true,
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-gray-900 to-budju-black"
    >
      <div className="budju-container">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Bank Description */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              <span className="text-budju-blue">What is the </span>
              <span className="text-white">Bank of BUDJU?</span>
            </h2>

            <div className="space-y-4 text-lg text-gray-300">
              <p>
                The Bank of BUDJU, set up by the Dev Team, uses any revenue
                derived from Merchandise, Staked Solana Interest, VC's, and
                NFT's to invest in the development of the BUDJU platform and to
                provide liquidity to the Solana blockchain.
              </p>

              <p className="font-semibold">
                The Bank of BUDJU will buyback and burn BUDJU tokens to create
                scarcity and increase token price.
              </p>

              <div className="mt-8 bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                <h3 className="text-xl font-bold mb-4 text-budju-pink">
                  Bank of BUDJU Address
                </h3>

                <div className="flex items-center bg-gray-800/80 p-3 rounded-lg mb-4">
                  <code className="text-sm text-gray-300 font-mono truncate flex-1">
                    {BANK_ADDRESS}
                  </code>
                  <CopyToClipboard text={BANK_ADDRESS} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <a
                    href={`https://solscan.io/account/${BANK_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center bg-budju-blue/20 hover:bg-budju-blue/30 text-budju-blue py-2 px-4 rounded-lg transition-colors duration-300"
                  >
                    View on Solscan
                  </a>

                  <Button as="a" href="#deposit" variant="primary">
                    Make a Deposit
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Animated Bank Vault */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex justify-center"
          >
            <div
              ref={animatedRef}
              className="relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl p-8 shadow-budju border border-gray-700 max-w-md transform perspective-1000"
            >
              {/* Bank Vault Image */}
              <img
                src="src/assets/images/bank/bank-vault.png"
                alt="Bank of BUDJU Vault"
                className="w-full h-auto rounded-lg"
              />

              {/* Decorative Elements */}
              <div className="absolute -top-4 -left-4 w-16 h-16 rounded-full bg-budju-pink/30 blur-xl"></div>
              <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-budju-blue/20 blur-xl"></div>

              {/* Bank Stats */}
              <div className="absolute bottom-12 right-4 bg-gray-900/80 backdrop-blur-sm rounded-lg p-4 border border-gray-700 shadow-lg">
                <div className="text-sm text-gray-400">Total Burned</div>
                <div className="text-xl font-bold text-budju-pink">
                  1,569,299 BUDJU
                </div>
                <div className="text-sm text-gray-400 mt-2">Last Burn</div>
                <div className="text-budju-blue font-medium">Feb 26, 2025</div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* How it Works */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-20"
        >
          <h3 className="text-2xl font-bold mb-6 text-center">
            <span className="text-white">How the </span>
            <span className="text-budju-pink">Bank Works</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="budju-card p-6 text-center">
              <div className="w-16 h-16 bg-budju-pink/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Deposits</h4>
              <p className="text-gray-300">
                Community members deposit SOL, BUDJU, or other tokens to support
                the project and earn rewards.
              </p>
            </div>

            <div className="budju-card p-6 text-center">
              <div className="w-16 h-16 bg-budju-blue/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🏦</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Investment</h4>
              <p className="text-gray-300">
                The Bank uses funds to invest in platform development, staking,
                and providing liquidity.
              </p>
            </div>

            <div className="budju-card p-6 text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔥</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">
                Buyback & Burn
              </h4>
              <p className="text-gray-300">
                Regular token buybacks and burns create scarcity and increase
                value for all holders.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BankIntro;
