import { useEffect } from "react";
import { motion } from "motion/react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import HarvestRewards from "./components/HarvestRewards";
import PoolIntro from "./components/PoolIntro";
import PoolLinks from "./components/PoolLinks";
import AddLiquidityGuide from "./components/AddLiquidityGuide";
import ConcentratedLiquidity from "./components/ConcentratedLiquidity";
import PoolFAQ from "./components/PoolFAQ";
import PoolStats from "./components/PoolStats";
import RebalanceGuide from "./components/RebalanceGuide";
import RemoveLiquidityGuide from "./components/RemoveLiquidityGuide";
import { useTheme } from "@/context/ThemeContext";

const Pool = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `Pool of ${APP_NAME} - Liquidity Providing Guide`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Learn how to provide liquidity to BUDJU pools, become a market maker, harvest rewards, and manage your positions.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Learn how to provide liquidity to BUDJU pools, become a market maker, harvest rewards, and manage your positions.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <main>
      {/* Hero Section */}
      <section
        className={`pt-24 pb-16 ${isDarkMode ? "bg-gradient-to-b" : "bg-gradient-to-b"}`}
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
                Pool of{" "}
              </span>
              <span className="text-budju-blue">BUDJU</span>
            </h1>
            <p
              className={`text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
            >
              Become a market maker, provide liquidity, and earn rewards in the
              BUDJU ecosystem.
            </p>
          </motion.div>
        </div>
      </section>
      <BudjuParadeBanner />
      {/* Pool Introduction */}
      <PoolIntro />
      {/* Pool Statistics */}
      <PoolStats />
      {/* Concentrated Liquidity Explanation */}
      <ConcentratedLiquidity />
      {/* Add Liquidity Guide */}
      <AddLiquidityGuide />
      {/* Remove Liquidity Guide */}
      <RemoveLiquidityGuide />
      {/* Rebalance Guide */}
      <RebalanceGuide />
      {/* Harvest Rewards */}
      <HarvestRewards />
      {/* Pool Links */}
      <PoolLinks />
      {/* Pool FAQ */}
      <PoolFAQ />
    </main>
  );
};

export default Pool;
