import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaShieldAlt, FaBolt, FaExchangeAlt, FaWallet } from "react-icons/fa";
import { TOKEN_ADDRESS } from "@constants/addresses";
import CopyToClipboard from "@components/common/CopyToClipboard";
import { useTheme } from "@/context/ThemeContext";

const wallets = [
  {
    name: "Phantom",
    logo: "/images/how-to-buy/phantom-logo.png",
    features: [
      { icon: FaShieldAlt, text: "Secure & user-friendly" },
      { icon: FaBolt, text: "Fast transactions" },
      { icon: FaExchangeAlt, text: "Built-in DEX swaps" },
    ],
    downloadUrl: "https://phantom.app/",
    background: "bg-gradient-to-br from-purple-300 to-purple-900",
  },
  {
    name: "Jupiter",
    logo: "/images/how-to-buy/jupiter-logo.png",
    features: [
      { icon: FaExchangeAlt, text: "Best swap rates" },
      { icon: FaBolt, text: "Optimal routing" },
      { icon: FaWallet, text: "Multiple wallet support" },
    ],
    downloadUrl: "https://jup.ag/",
    background: "bg-gradient-to-br from-orange-300 to-red-800",
  },
  {
    name: "Solflare",
    logo: "/images/how-to-buy/solflare-logo.png",
    features: [
      { icon: FaExchangeAlt, text: "Reliable wallet" },
      { icon: FaBolt, text: "Multiple options" },
      { icon: FaWallet, text: "Multiple wallet support" },
    ],
    downloadUrl: "https://www.solflare.com/",
    background: "bg-gradient-to-br from-green-300 to-green-800",
  },
];

const WalletOptions = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".wallet-card");

      // Animate cards on scroll
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
          scale: 0.95,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.2,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: cardsRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-budju-blue">RECOMMENDED</span>{" "}
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              WALLETS
            </span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Choose one of these trusted wallets to start your BUDJU journey.
            Both options offer a secure and easy way to buy, store and manage
            your tokens.
          </p>
        </motion.div>

        {/* Wallet Cards */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mb-12"
        >
          {wallets.map((wallet) => (
            <div
              key={wallet.name}
              className={`wallet-card rounded-xl overflow-hidden shadow-budju ${wallet.background} transition-all duration-500 hover:shadow-budju-lg hover:-translate-y-2`}
            >
              <div className="p-6">
                {/* Wallet Header */}
                <div className="flex items-center mb-6">
                  <img
                    src={wallet.logo}
                    alt={`${wallet.name} Logo`}
                    className="w-12 h-12 mr-4"
                  />
                  <h3 className="text-2xl font-bold text-white">
                    {wallet.name}
                  </h3>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {wallet.features.map((feature, index) => (
                    <li key={index} className="flex items-center text-white">
                      <feature.icon className="mr-3 text-white/70" />
                      <span>{feature.text}</span>
                    </li>
                  ))}
                </ul>

                {/* Download Button */}
                <a
                  href={wallet.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-4 rounded-lg text-center transition-colors duration-300"
                >
                  Download {wallet.name}
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* BUDJU Token Address */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className={`max-w-4xl mx-auto ${isDarkMode ? "bg-gray-900/50 border-gray-800" : "bg-white/20 border-white/30"} rounded-xl border p-6`}
        >
          <h3 className="text-2xl font-semibold mb-4 text-center">
            <span className="text-budju-blue">BUDJU</span>{" "}
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              TOKEN ADDRESS
            </span>
          </h3>

          <p
            className={`${isDarkMode ? "text-gray-300" : "text-white"} mb-4 text-center`}
          >
            Copy this address to add the BUDJU token to your wallet or when
            performing a swap:
          </p>

          <div
            className={`flex items-center ${isDarkMode ? "bg-gray-800/80" : "bg-white/30"} p-3 rounded-lg`}
          >
            <code
              className={`text-sm ${isDarkMode ? "text-gray-300" : "text-white"} font-mono truncate flex-1`}
            >
              {TOKEN_ADDRESS}
            </code>
            <CopyToClipboard text={TOKEN_ADDRESS} />
          </div>

          <p
            className={`text-center ${isDarkMode ? "text-gray-400" : "text-white/80"} mt-4 text-sm`}
          >
            Always double-check this address when swapping to ensure you're
            buying the genuine BUDJU token!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default WalletOptions;
