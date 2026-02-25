// src/features/tokenomics/Tokenomics.tsx
import { useEffect } from "react";
import { motion } from "framer-motion";
import { APP_NAME } from "@constants/config";

import DexScreener from "./components/DexScreener";
import TokenHistory from "./components/TokenHistory";
import TokenSupply from "./components/TokenSupply";
import { useTheme } from "@/context/ThemeContext";

const Tokenomics = () => {
  const { isDarkMode } = useTheme();

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
      <section className="pt-24 pb-16">
        <div className="budju-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1
              className={`text-4xl md:text-5xl lg:text-6xl font-bold font-display mb-6 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Token
              <span className="bg-gradient-to-r from-cyan-400 to-budju-blue bg-clip-text text-transparent">
                omics
              </span>
            </h1>
            <p
              className={`text-lg ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Two budju's fell down a hole. One said, "It's dark in here isn't
              it?" The other replied, "I don't know; I can't see."
            </p>
          </motion.div>
        </div>
      </section>

      {/* Token Supply Information */}
      <TokenSupply />

      {/* DexScreener Integration */}
      <DexScreener />

      {/* Token History */}
      <TokenHistory />
    </main>
  );
};

export default Tokenomics;
