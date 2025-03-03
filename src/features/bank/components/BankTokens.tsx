import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";

// Token holding interface
interface TokenHolding {
  name: string;
  symbol: string;
  logo: string;
  amount: number;
  value: number;
  color: string;
}

// Bank token holdings
const tokenHoldings: TokenHolding[] = [
  {
    name: "Solana",
    symbol: "SOL",
    logo: "/images/tokens/sol.png",
    amount: 12.45,
    value: 1432.5,
    color: "bg-purple-600",
  },
  {
    name: "BUDJU Coin",
    symbol: "BUDJU",
    logo: "/images/logo.png",
    amount: 5248932.73,
    value: 1049.79,
    color: "bg-budju-pink",
  },
  {
    name: "USD Coin",
    symbol: "USDC",
    logo: "/images/tokens/usdc.png",
    amount: 925.12,
    value: 925.12,
    color: "bg-blue-500",
  },
  {
    name: "Jito Staked SOL",
    symbol: "JitoSOL",
    logo: "/images/tokens/jitosol.png",
    amount: 8.23,
    value: 947.65,
    color: "bg-teal-500",
  },
];

const BankTokens = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".token-card");

      // Animate cards on scroll
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 20,
          scale: 0.95,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 80%",
          },
        },
      );

      // Add hover effects for each card
      cards.forEach((card) => {
        card.addEventListener("mouseenter", () => {
          gsap.to(card, {
            y: -5,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.3)",
            duration: 0.3,
          });
        });

        card.addEventListener("mouseleave", () => {
          gsap.to(card, {
            y: 0,
            boxShadow: "0 4px 8px rgba(0, 0, 0, 0.2)",
            duration: 0.5,
            ease: "elastic.out(1, 0.5)",
          });
        });
      });
    }
  }, []);

  // Calculate total bank value
  const totalBankValue = tokenHoldings.reduce(
    (sum, token) => sum + token.value,
    0,
  );

  return (
    <section
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
            <span className="text-budju-blue">BANK</span>{" "}
            <span className="text-white">HOLDINGS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Current assets held in the Bank of BUDJU
          </p>
        </motion.div>

        {/* Total Value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-center mb-10"
        >
          <div className="text-gray-400 mb-1">Total Bank Assets</div>
          <div className="text-4xl font-bold text-white">
            ${totalBankValue.toLocaleString()}
          </div>
        </motion.div>

        {/* Token Cards */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto"
        >
          {tokenHoldings.map((token, _) => (
            <div
              key={token.symbol}
              className={`token-card budju-card overflow-hidden`}
            >
              {/* Top colored bar */}
              <div className={`h-2 ${token.color}`}></div>

              <div className="p-6">
                {/* Token header */}
                <div className="flex items-center mb-4">
                  <img
                    src={token.logo}
                    alt={token.name}
                    className="w-10 h-10 mr-3"
                  />
                  <div>
                    <div className="text-white font-bold">{token.name}</div>
                    <div className="text-gray-400 text-sm">{token.symbol}</div>
                  </div>
                </div>

                {/* Token amount */}
                <div className="mb-2">
                  <div className="text-gray-400 text-sm">Amount</div>
                  <div className="text-xl font-mono text-white">
                    {token.amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>

                {/* Token value */}
                <div className="mb-2">
                  <div className="text-gray-400 text-sm">Value</div>
                  <div className="text-xl font-bold text-budju-blue">
                    $
                    {token.value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </div>

                {/* Percentage of total */}
                <div>
                  <div className="text-gray-400 text-sm">% of Bank</div>
                  <div className="text-white">
                    {((token.value / totalBankValue) * 100).toFixed(1)}%
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${token.color}`}
                    style={{
                      width: `${(token.value / totalBankValue) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-10 text-gray-400 text-sm max-w-2xl mx-auto">
          All Bank of BUDJU holdings are verifiable on the Solana blockchain and
          regularly updated. Assets are used for token buybacks, burns, and
          ecosystem development.
        </div>
      </div>
    </section>
  );
};

export default BankTokens;
