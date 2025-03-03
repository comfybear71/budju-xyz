import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaFireAlt, FaDollarSign, FaUsers, FaChartLine } from "react-icons/fa";
import CopyToClipboard from "@components/common/CopyToClipboard";
import Button from "@components/common/Button";
import {
  TOKEN_ADDRESS,
  BURN_ADDRESS,
  SOLSCAN_LINK,
} from "@constants/addresses";
import { TOKEN_INFO } from "@constants/config";
import { animateCounter } from "@/lib/utils/animation";

// Token stats component for displaying live token data
const TokenStats = () => {
  const [tokenData, setTokenData] = useState({
    price: 0.00023,
    marketCap: 230000,
    holders: 123,
    supply: TOKEN_INFO.TOTAL_SUPPLY,
    burned: 1569299,
  });

  const statsRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const mcapRef = useRef<HTMLSpanElement>(null);
  const holdersRef = useRef<HTMLSpanElement>(null);
  const supplyRef = useRef<HTMLSpanElement>(null);

  // Simulate fetching token data - would be replaced with actual API call to blockchain
  useEffect(() => {
    const fetchTokenData = async () => {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // In a real app, this would be a blockchain API call
      setTokenData({
        price: 0.00023,
        marketCap: 230000,
        holders: 123,
        supply: TOKEN_INFO.TOTAL_SUPPLY,
        burned: 1569299,
      });
    };

    fetchTokenData();

    // Refresh data every 30 seconds
    const intervalId = setInterval(fetchTokenData, 30000);

    return () => clearInterval(intervalId);
  }, []);

  // Animate counters when they come into view
  useEffect(() => {
    if (
      statsRef.current &&
      priceRef.current &&
      mcapRef.current &&
      holdersRef.current &&
      supplyRef.current
    ) {
      // Create a timeline for animations
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: statsRef.current,
          start: "top 80%",
        },
      });

      // Add counter animations to the timeline
      tl.add(() => {
        // Animate price counter
        animateCounter(priceRef.current!, tokenData.price, {
          prefix: "$",
          decimals: 8,
        });

        // Animate market cap counter
        animateCounter(mcapRef.current!, tokenData.marketCap, {
          prefix: "$",
        });

        // Animate holders counter
        animateCounter(holdersRef.current!, tokenData.holders);

        // Animate supply counter
        animateCounter(supplyRef.current!, tokenData.supply - tokenData.burned);
      });
    }
  }, [tokenData]);

  // Format remaining supply
  const remainingSupply = tokenData.supply - tokenData.burned;

  return (
    <section className="py-16 bg-gradient-to-b from-gray-900 to-budju-black">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <h2 className="text-3xl md:text-4xl font-bold">
            <span className="text-budju-blue">LIVE</span>{" "}
            <span className="text-white">TOKEN STATS</span>
          </h2>
        </motion.div>

        {/* Stats Cards */}
        <div
          ref={statsRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {/* Price Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="budju-card flex flex-col items-center p-6"
          >
            <div className="bg-budju-pink/20 p-3 rounded-full mb-4">
              <FaDollarSign size={24} className="text-budju-pink" />
            </div>
            <h3 className="text-lg text-gray-300 mb-2">BUDJU Price</h3>
            <p className="text-2xl font-bold text-white mb-1">
              <span ref={priceRef}>${tokenData.price.toFixed(8)}</span>
            </p>
            <p className="text-sm text-budju-blue">Updated in real-time</p>
          </motion.div>

          {/* Market Cap Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="budju-card flex flex-col items-center p-6"
          >
            <div className="bg-budju-blue/20 p-3 rounded-full mb-4">
              <FaChartLine size={24} className="text-budju-blue" />
            </div>
            <h3 className="text-lg text-gray-300 mb-2">Market Cap</h3>
            <p className="text-2xl font-bold text-white mb-1">
              <span ref={mcapRef}>${tokenData.marketCap.toLocaleString()}</span>
            </p>
            <p className="text-sm text-budju-blue">Fully diluted valuation</p>
          </motion.div>

          {/* Holders Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="budju-card flex flex-col items-center p-6"
          >
            <div className="bg-green-500/20 p-3 rounded-full mb-4">
              <FaUsers size={24} className="text-green-500" />
            </div>
            <h3 className="text-lg text-gray-300 mb-2">Holders</h3>
            <p className="text-2xl font-bold text-white mb-1">
              <span ref={holdersRef}>{tokenData.holders.toLocaleString()}</span>
            </p>
            <p className="text-sm text-budju-blue">BUDJU community members</p>
          </motion.div>

          {/* Circulating Supply Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            className="budju-card flex flex-col items-center p-6"
          >
            <div className="bg-budju-pink/20 p-3 rounded-full mb-4">
              <FaFireAlt size={24} className="text-budju-pink" />
            </div>
            <h3 className="text-lg text-gray-300 mb-2">Circulating Supply</h3>
            <p className="text-2xl font-bold text-white mb-1">
              <span ref={supplyRef}>{remainingSupply.toLocaleString()}</span>
            </p>
            <p className="text-sm text-budju-blue">
              <span className="text-red-400">
                {tokenData.burned.toLocaleString()}
              </span>{" "}
              BUDJU burned
            </p>
          </motion.div>
        </div>

        {/* Token Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 bg-gray-900/50 rounded-xl border border-gray-800 p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Token Contract */}
            <div>
              <h3 className="text-xl font-semibold mb-2">
                <span className="text-budju-blue">TOKEN</span>{" "}
                <span className="text-white">ADDRESS</span>
              </h3>
              <div className="flex items-center bg-gray-800/80 p-2 rounded-lg">
                <code className="text-sm text-gray-300 font-mono truncate flex-1">
                  {TOKEN_ADDRESS}
                </code>
                <CopyToClipboard text={TOKEN_ADDRESS} />
              </div>
            </div>

            {/* Burn Address */}
            <div>
              <h3 className="text-xl font-semibold mb-2">
                <span className="text-white">BURN</span>{" "}
                <span className="text-budju-pink">ADDRESS</span>
              </h3>
              <div className="flex items-center bg-gray-800/80 p-2 rounded-lg">
                <code className="text-sm text-gray-300 font-mono truncate flex-1">
                  {BURN_ADDRESS}
                </code>
                <CopyToClipboard text={BURN_ADDRESS} />
              </div>
            </div>
          </div>

          {/* View on Explorer */}
          <div className="mt-6 flex justify-center">
            <Button
              as="a"
              href={SOLSCAN_LINK}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="md"
            >
              View on Solscan
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default TokenStats;
