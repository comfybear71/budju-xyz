import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { FaFireAlt, FaDollarSign, FaUsers, FaChartLine } from "react-icons/fa";
import CopyToClipboard from "@components/common/CopyToClipboard";
import Button from "@components/common/Button";
import {
  fetchHeliusTokenMetrics,
  getTokenBalances,
  HeliusTokenBalance,
  TOKEN_ADDRESS,
  BURN_ADDRESS,
} from "@/lib/utils/tokenService";
import { animateCounter, animateCounterPrice } from "@/lib/utils/animation";

gsap.registerPlugin(ScrollTrigger);

interface TokenData {
  price: number;
  marketCap: number;
  holders: number;
  volume24h: number;
  totalSupply: number;
  burned: number;
}

const TokenStats = () => {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topHolders, setTopHolders] = useState<
    { address: string; percentage: number }[]
  >([]);

  const statsRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const mcapRef = useRef<HTMLSpanElement>(null);
  const holdersRef = useRef<HTMLSpanElement>(null);
  const supplyRef = useRef<HTMLSpanElement>(null);

  const SOLSCAN_LINK = `https://solscan.io/token/${TOKEN_ADDRESS}`;

  const fetchTokenData = async () => {
    try {
      setLoading(true);
      setError(null);

      const metrics = await fetchHeliusTokenMetrics();
      console.log("Fetched token metrics (including price):", metrics);

      const tokenBalances: HeliusTokenBalance[] = await getTokenBalances();
      const sortedBalances = tokenBalances
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const totalTokens = tokenBalances.reduce(
        (sum, balance) => sum + balance.amount,
        0,
      );

      const topHoldersWithPercentage = sortedBalances.map((balance) => ({
        address: balance.owner,
        percentage: totalTokens > 0 ? (balance.amount / totalTokens) * 100 : 0,
      }));

      setTopHolders(topHoldersWithPercentage);
      setTokenData(metrics);
    } catch (err) {
      console.error("Error fetching token data:", err);
      setError("Failed to load token data. Please try again later.");
      setTokenData(null);
      setTopHolders([
        { address: "ABC...XYZ", percentage: 15 },
        { address: "DEF...UVW", percentage: 10 },
        { address: "GHI...RST", percentage: 8 },
        { address: "JKL...MNO", percentage: 5 },
        { address: "PQR...STU", percentage: 3 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (
      !loading &&
      tokenData &&
      statsRef.current &&
      priceRef.current &&
      mcapRef.current &&
      holdersRef.current &&
      supplyRef.current
    ) {
      console.log("Animating price:", tokenData.price);
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: statsRef.current,
          start: "top 80%",
        },
      });

      tl.add(() => {
        animateCounterPrice(priceRef.current!, tokenData.price, {
          prefix: "$",
          decimals: 8,
        });
        animateCounter(mcapRef.current!, tokenData.marketCap, {
          prefix: "$",
        });
        animateCounter(holdersRef.current!, tokenData.holders);
        animateCounter(
          supplyRef.current!,
          tokenData.totalSupply - tokenData.burned,
        );
      });
    }
  }, [loading, tokenData]);

  const remainingSupply = tokenData
    ? tokenData.totalSupply - tokenData.burned
    : 0;

  console.log(tokenData, "token data");
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

        {error && (
          <div className="text-center text-red-400 mb-6">
            {error}. Please try again later.
          </div>
        )}

        <div
          ref={statsRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
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
              <span ref={priceRef}>
                {loading
                  ? "Loading..."
                  : tokenData
                    ? `$${tokenData.price.toFixed(8)}` // Static display
                    : "N/A"}
              </span>
            </p>
            <p className="text-sm text-budju-blue">
              {loading ? "Fetching data..." : "Updated in real-time"}
            </p>
          </motion.div>

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
              <span ref={mcapRef}>
                {loading
                  ? "Loading..."
                  : tokenData
                    ? `$${tokenData.marketCap.toLocaleString()}`
                    : "N/A"}
              </span>
            </p>
            <p className="text-sm text-budju-blue">
              {loading ? "Fetching data..." : "Fully diluted valuation"}
            </p>
          </motion.div>

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
              <span ref={holdersRef}>
                {loading
                  ? "Loading..."
                  : tokenData
                    ? tokenData.holders.toLocaleString()
                    : "N/A"}
              </span>
            </p>
            <p className="text-sm text-budju-blue">
              {loading ? "Fetching data..." : "BUDJU community members"}
            </p>
          </motion.div>

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
              <span ref={supplyRef}>
                {loading
                  ? "Loading..."
                  : tokenData
                    ? remainingSupply.toLocaleString()
                    : "N/A"}
              </span>
            </p>
            <p className="text-sm text-budju-blue">
              <span className="text-red-400">
                {tokenData ? tokenData.burned.toLocaleString() : "0"}
              </span>{" "}
              BUDJU burned
            </p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 bg-gray-900/50 rounded-xl border border-gray-800 p-6"
        >
          <h3 className="text-xl font-semibold mb-4 text-center">
            <span className="text-white">Top</span>{" "}
            <span className="text-budju-blue">Holders</span>
          </h3>

          <div className="space-y-3">
            {topHolders.map((holder, index) => (
              <div
                key={holder.address}
                className="flex justify-between items-center bg-gray-800/50 p-3 rounded-lg"
              >
                <div className="flex items-center">
                  <span className="mr-3 text-gray-400">{index + 1}.</span>
                  <code className="text-sm text-budju-blue font-mono">
                    {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                  </code>
                </div>
                <span className="text-white font-medium">
                  {holder.percentage.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-12 bg-gray-900/50 rounded-xl border border-gray-800 p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
