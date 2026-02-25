import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { FaShieldAlt, FaBolt, FaExchangeAlt, FaWallet, FaCopy } from "react-icons/fa";
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
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    hoverBorder: "hover:border-purple-500/40",
    iconColor: "text-purple-400/70",
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
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    hoverBorder: "hover:border-orange-500/40",
    iconColor: "text-orange-400/70",
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
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    hoverBorder: "hover:border-green-500/40",
    iconColor: "text-green-400/70",
  },
];

const WalletOptions = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && cardsRef.current) {
      const cards = cardsRef.current.querySelectorAll(".wallet-card");
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20, scale: 0.98 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: { trigger: cardsRef.current, start: "top 80%" },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Recommended{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Wallets
            </span>
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Choose one of these trusted wallets to start your BUDJU journey.
          </p>
        </motion.div>

        {/* Wallet Cards */}
        <div
          ref={cardsRef}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto mb-10"
        >
          {wallets.map((wallet) => (
            <div
              key={wallet.name}
              className={`wallet-card rounded-xl border p-5 transition-all duration-300 hover:scale-[1.02] ${
                isDarkMode
                  ? `bg-[#0c0c20]/60 ${wallet.border} ${wallet.hoverBorder}`
                  : `bg-white/60 border-gray-200/40 hover:border-gray-300/60`
              } backdrop-blur-sm`}
            >
              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <img
                  src={wallet.logo}
                  alt={`${wallet.name} Logo`}
                  className="w-10 h-10"
                />
                <h3
                  className={`text-base font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {wallet.name}
                </h3>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-5">
                {wallet.features.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <feature.icon className={wallet.iconColor} size={12} />
                    <span
                      className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                    >
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Download Button */}
              <a
                href={wallet.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full py-2.5 rounded-lg text-xs font-bold text-center transition-all ${
                  isDarkMode
                    ? `${wallet.bg} ${wallet.border} border ${wallet.color} hover:opacity-80`
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                Download {wallet.name}
              </a>
            </div>
          ))}
        </div>

        {/* Token Address */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className={`max-w-3xl mx-auto rounded-xl border p-5 ${
            isDarkMode
              ? "bg-[#0c0c20]/60 border-white/[0.06]"
              : "bg-white/60 border-gray-200/40"
          } backdrop-blur-sm`}
        >
          <h3
            className={`text-base font-bold font-display text-center mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            BUDJU{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Token Address
            </span>
          </h3>

          <p
            className={`text-xs text-center mb-3 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Copy this address to add the BUDJU token to your wallet or when
            performing a swap.
          </p>

          <div
            className={`flex items-center gap-2 p-3 rounded-lg ${
              isDarkMode
                ? "bg-white/[0.03] border border-white/[0.06]"
                : "bg-gray-50 border border-gray-200/60"
            }`}
          >
            <code
              className={`text-[11px] font-mono truncate flex-1 ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}
            >
              {TOKEN_ADDRESS}
            </code>
            <CopyToClipboard text={TOKEN_ADDRESS} />
          </div>

          <p
            className={`text-center text-[10px] mt-2 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
          >
            Always double-check this address to ensure you're buying the genuine
            BUDJU token!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default WalletOptions;
