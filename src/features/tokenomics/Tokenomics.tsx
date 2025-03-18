// src/features/tokenomics/Tokenomics.tsx
import { useEffect } from "react";
import { motion } from "framer-motion"; // Updated from "motion/react"
import { APP_NAME } from "@constants/config";
import TokenStats from "@components/common/TokenStats";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import DexScreener from "./components/DexScreener";
import PriceChart from "./components/PriceChart";
import TokenAddresses from "./components/TokenAddresses";
import TokenHistory from "./components/TokenHistory";
import TokenSupply from "./components/TokenSupply";
import { useTheme } from "@/context/ThemeContext"; // Added for theme support

const Tokenomics = () => {
  const { isDarkMode } = useTheme(); // Added theme hook

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Tokenomics - ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "BUDJU Coin tokenomics - supply, distribution, burn mechanism, and market statistics.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "BUDJU Coin tokenomics - supply, distribution, burn mechanism, and market statistics.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <main>
      {/* Hero Section */}
      <section
        className={`pt-24 pb-16 ${isDarkMode ? "bg-gradient-to-b from-budju-black to-gray-900" : "bg-gradient-to-b from-budju-pink-light to-budju-pink"}`}
      >
        <div className="budju-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                Token
              </span>
              <span className="text-budju-blue">omics</span>
            </h1>
            <p
              className={`text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
            >
              Two budju's fell down a hole. One said, "It's dark in here isn't
              it?" The other replied, "I don't know; I can't see."
            </p>
          </motion.div>
        </div>
      </section>

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* Live Token Stats */}
      <TokenStats />

      {/* Token Supply Information */}
      <TokenSupply />

      {/* Price Chart */}
      <PriceChart />

      {/* Token Addresses */}
      <TokenAddresses />

      {/* DexScreener Integration */}
      <DexScreener />

      {/* Token History */}
      <TokenHistory />
    </main>
  );
};

export default Tokenomics;