import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { BURN_ADDRESS } from "@constants/addresses";
import { TOKEN_INFO } from "@constants/config";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { animateCounter } from "@/lib/utils/animation";

// Burn event type definition
interface BurnEvent {
  date: string;
  amount: number;
  txHash: string;
  value: number;
}

// Sample burn history
const burnHistory: BurnEvent[] = [
  {
    date: "Feb 26, 2025",
    amount: 1069299,
    txHash:
      "3pDo7xKjnFkmNmAHrHLfEkG8zXcXJvCUXHFv24qfMdCSzEbJRRYHbKGEHZUEMETaJWjfAiE",
    value: 230.64,
  },
  {
    date: "Feb 15, 2025",
    amount: 500000,
    txHash:
      "5xHq8qBpNtXV2Cs6mBXuuhrLrwpVkqx3QQmE7Lp3yHhUDdzCsRznXYeGagjDVpJi9FavANq",
    value: 105.75,
  },
];

const BurnStatistics = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const burnedCountRef = useRef<HTMLSpanElement>(null);
  const percentageRef = useRef<HTMLSpanElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  const [burnEvents] = useState(burnHistory);
  // const [burnedTokens] = useState(1569299); // From the sample data

  // Calculate statistics
  const totalBurned = burnEvents.reduce((sum, event) => sum + event.amount, 0);
  const totalValue = burnEvents.reduce((sum, event) => sum + event.value, 0);
  const percentageBurned = (totalBurned / TOKEN_INFO.TOTAL_SUPPLY) * 100;

  // Animate counters when they come into view
  useEffect(() => {
    if (
      statsRef.current &&
      burnedCountRef.current &&
      percentageRef.current &&
      valueRef.current
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
        // Animate burned tokens counter
        animateCounter(burnedCountRef.current!, totalBurned, {
          suffix: " BUDJU",
        });

        // Animate percentage counter
        animateCounter(percentageRef.current!, percentageBurned, {
          suffix: "%",
          decimals: 2,
        });

        // Animate value counter
        animateCounter(valueRef.current!, totalValue, {
          prefix: "$",
          decimals: 2,
        });
      });

      // Create flame animation for the burn icon
      const flames = document.querySelectorAll(".burn-flame");

      flames.forEach((flame) => {
        gsap.to(flame, {
          scale: 1.2,
          opacity: 0.8,
          duration: 0.8,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });
    }
  }, [totalBurned, percentageBurned, totalValue]);

  return (
    <section
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
            <span className="text-white">BURN</span>{" "}
            <span className="text-budju-pink">STATISTICS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            BUDJU implements a deflationary tokenomics model through strategic
            token burns
          </p>
        </motion.div>

        {/* Burn Stats */}
        <div
          ref={statsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12"
        >
          {/* Total Burned */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="budju-card p-6 text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 bg-red-500/30 rounded-full blur-md burn-flame"></div>
              <div className="relative bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center">
                <span className="text-3xl">🔥</span>
              </div>
            </div>

            <h3 className="text-lg text-gray-300 mb-2">Total Burned</h3>
            <p className="text-2xl font-bold text-white">
              <span ref={burnedCountRef}>
                {totalBurned.toLocaleString()} BUDJU
              </span>
            </p>
          </motion.div>

          {/* Percentage Burned */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="budju-card p-6 text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 bg-budju-blue/30 rounded-full blur-md"></div>
              <div className="relative bg-budju-blue/20 w-16 h-16 rounded-full flex items-center justify-center">
                <span className="text-3xl">📊</span>
              </div>
            </div>

            <h3 className="text-lg text-gray-300 mb-2">Percentage of Supply</h3>
            <p className="text-2xl font-bold text-white">
              <span ref={percentageRef}>{percentageBurned.toFixed(2)}%</span>
            </p>
          </motion.div>

          {/* Value Burned */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="budju-card p-6 text-center"
          >
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 bg-green-500/30 rounded-full blur-md"></div>
              <div className="relative bg-green-500/20 w-16 h-16 rounded-full flex items-center justify-center">
                <span className="text-3xl">💰</span>
              </div>
            </div>

            <h3 className="text-lg text-gray-300 mb-2">Total Value Burned</h3>
            <p className="text-2xl font-bold text-white">
              <span ref={valueRef}>${totalValue.toFixed(2)}</span>
            </p>
          </motion.div>
        </div>

        {/* Burn Address */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="max-w-4xl mx-auto bg-gray-900/50 rounded-xl border border-gray-800 p-6 mb-12"
        >
          <h3 className="text-xl font-semibold mb-4 text-center">
            <span className="text-budju-pink">BURNED TOKEN</span>{" "}
            <span className="text-white">ADDRESS</span>
          </h3>

          <div className="flex items-center bg-gray-800/80 p-3 rounded-lg">
            <code className="text-sm text-gray-300 font-mono truncate flex-1">
              {BURN_ADDRESS}
            </code>
            <CopyToClipboard text={BURN_ADDRESS} />
          </div>

          <p className="text-center text-gray-400 mt-4 text-sm">
            This is the official burn address for BUDJU tokens. Tokens sent to
            this address are removed from circulation permanently.
          </p>
        </motion.div>

        {/* Burn History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <h3 className="text-xl font-semibold mb-6 text-center">
            <span className="text-white">Burn</span>{" "}
            <span className="text-budju-pink">History</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-900/50">
                  <th className="py-3 px-4 text-left text-budju-blue font-medium">
                    Date
                  </th>
                  <th className="py-3 px-4 text-right text-budju-blue font-medium">
                    Amount
                  </th>
                  <th className="py-3 px-4 text-right text-budju-blue font-medium">
                    Value
                  </th>
                  <th className="py-3 px-4 text-left text-budju-blue font-medium">
                    Transaction
                  </th>
                </tr>
              </thead>
              <tbody>
                {burnEvents.map((event, index) => (
                  <tr
                    key={index}
                    className="border-b border-gray-800 last:border-b-0 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="py-3 px-4 text-white">{event.date}</td>
                    <td className="py-3 px-4 text-right text-white font-medium">
                      {event.amount.toLocaleString()} BUDJU
                    </td>
                    <td className="py-3 px-4 text-right text-green-400">
                      ${event.value.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={`https://solscan.io/tx/${event.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-budju-blue hover:underline font-mono text-xs md:text-sm truncate block max-w-[150px] md:max-w-[200px]"
                      >
                        {event.txHash.substring(0, 10)}...
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-center text-gray-400 mt-4 text-sm">
            All burn transactions are verifiable on the Solana blockchain
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default BurnStatistics;
