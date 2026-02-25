import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaExternalLinkAlt } from "react-icons/fa";
// import Button from "@components/common/Button";
import { BANK_ADDRESS } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";
import {
  fetchBurnEvents,
  BURN_ADDRESS,
  TOKEN_ADDRESS,
} from "@lib/utils/tokenService";
import { useTheme } from "@/context/ThemeContext";

interface BurnStats {
  totalBurned: number;
  lastBurnDate: string;
}

const BankIntro = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const animatedRef = useRef<HTMLDivElement>(null);
  const [, setBurnStats] = useState<BurnStats>({
    totalBurned: 0,
    lastBurnDate: "N/A",
  });
  const [, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);

  // Fetch burn data
  useEffect(() => {
    const loadBurnStats = async () => {
      try {
        setLoading(true);
        const burnEvents = await fetchBurnEvents(BURN_ADDRESS, TOKEN_ADDRESS);

        if (burnEvents.length > 0) {
          const totalBurned = burnEvents.reduce(
            (sum, event) => sum + event.amount,
            0,
          );
          const lastBurnEvent = burnEvents.sort(
            (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
          )[0];
          const lastBurnDate = lastBurnEvent.date;

          setBurnStats({
            totalBurned,
            lastBurnDate,
          });
        } else {
          setBurnStats({
            totalBurned: 0,
            lastBurnDate: "No burns recorded",
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch burn data",
        );
        setBurnStats({
          totalBurned: 0,
          lastBurnDate: "Error",
        });
      } finally {
        setLoading(false);
      }
    };

    loadBurnStats();
  }, []);

  // GSAP animation for bank vault
  useEffect(() => {
    if (sectionRef.current && animatedRef.current) {
      gsap.fromTo(
        animatedRef.current,
        { rotationY: -20, rotationX: 10 },
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
      className={`py-20 ${isDarkMode ? "bg-gradient-to-b " : "bg-gradient-to-b"}`}
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
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                Bank of BUDJU?
              </span>
            </h2>

            <div className="space-y-4 text-lg">
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                The Bank of BUDJU, set up by the Dev Team, uses any revenue
                derived from Merchandise, Staked Solana Interest, VC's, and
                NFT's to invest in the development of the BUDJU platform and to
                provide liquidity to the Solana blockchain.
              </p>

              <p
                className={`font-semibold ${isDarkMode ? "text-gray-300" : "text-white"}`}
              >
                The Bank of BUDJU will buyback and burn BUDJU tokens to create
                scarcity and increase token price.
              </p>

              <div
                className={`mt-8 ${isDarkMode ? "bg-gray-900/50 border-gray-800" : "bg-white/20 border-white/30"} rounded-xl border p-6`}
              >
                <h3 className="text-xl font-bold mb-4 text-budju-pink">
                  Bank of BUDJU Address
                </h3>

                <div
                  className={`flex items-center ${isDarkMode ? "bg-gray-800/80" : "bg-white/30"} p-3 rounded-lg mb-4`}
                >
                  <code
                    className={`text-sm font-mono truncate flex-1 ${isDarkMode ? "text-gray-300" : "text-white"}`}
                  >
                    {BANK_ADDRESS}
                  </code>
                  <CopyToClipboard text={BANK_ADDRESS} />
                  <a
                    href={`https://solscan.io/account/${BANK_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-2 rounded-full transition-colors ${isDarkMode ? "text-budju-pink hover:bg-gray-600" : "text-budju-pink-dark hover:bg-gray-700"}`}
                    aria-label="View on Solscan"
                  >
                    <FaExternalLinkAlt size={16} />
                  </a>
                </div>

                {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                  <a
                    href={`https://solscan.io/account/${BANK_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-center ${isDarkMode ? "bg-budju-blue/20 hover:bg-budju-blue/30 text-budju-blue" : "bg-budju-blue/30 hover:bg-budju-blue/40 text-white"} py-2 px-4 rounded-lg transition-colors duration-300`}
                  >
                    View on Solscan
                  </a>

                  <Button as="a" href="#deposit" variant="primary">
                    Make a Deposit
                  </Button>
                </div> */}
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
              className={`relative ${isDarkMode ? "bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700" : "bg-gradient-to-br from-budju-pink-light to-budju-blue-light border-white/30"} rounded-xl p-8 shadow-budju border max-w-md transform perspective-1000`}
            >
              <img
                src="/images/logo.svg"
                alt="Bank of BUDJU Vault"
                className="w-full h-auto rounded-lg"
              />

              {/* <div className="absolute -top-4 -left-4 w-16 h-16 rounded-full bg-budju-pink/30 blur-xl"></div>
              <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-budju-blue/20 blur-xl"></div>

              <div
                className={`absolute bottom-12 right-4 ${isDarkMode ? "bg-gray-900/80 border-gray-700" : "bg-white/30 border-white/30"} backdrop-blur-sm rounded-lg p-4 border shadow-lg`}
              >
                <div
                  className={
                    isDarkMode ? "text-sm text-gray-400" : "text-sm text-white"
                  }
                >
                  Total Burned
                </div>
                <div className="text-xl font-bold text-budju-pink">
                  {loading
                    ? "Loading..."
                    : error
                      ? "Error"
                      : `${burnStats.totalBurned.toLocaleString()} BUDJU`}
                </div>
                <div
                  className={
                    isDarkMode
                      ? "text-sm text-gray-400 mt-2"
                      : "text-sm text-white mt-2"
                  }
                >
                  Last Burn
                </div>
                <div className="text-budju-blue font-medium">
                  {loading
                    ? "Loading..."
                    : error
                      ? "Error"
                      : burnStats.lastBurnDate}
                </div>
              </div> */}
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
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              How the{" "}
            </span>
            <span className="text-budju-pink">Bank Works</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div
              className={`${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 text-center`}
            >
              <div className="w-16 h-16 bg-budju-pink/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">💰</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Deposits
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Community members deposit SOL, BUDJU, or other tokens to support
                the project and earn rewards.
              </p>
            </div>

            <div
              className={`${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 text-center`}
            >
              <div className="w-16 h-16 bg-budju-blue/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🏦</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Investment
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                The Bank uses funds to invest in platform development, staking,
                and providing liquidity.
              </p>
            </div>

            <div
              className={`${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 text-center`}
            >
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🔥</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Buyback & Burn
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Regular token buybacks and burns create scarcity and increase
                value for all holders.
              </p>
            </div>

            <div
              className={`${isDarkMode ? "budju-card" : "bg-white/20 border border-white/30 rounded-xl shadow-lg"} p-6 text-center`}
            >
              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🤝</span>
              </div>
              <h4
                className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-budju-white"} mb-2`}
              >
                Community Rewards
              </h4>
              <p className={isDarkMode ? "text-gray-300" : "text-white"}>
                Your investment fuels growth. We note deposits—help us, and
                we’ll reward you!
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default BankIntro;
