import { useEffect } from "react";
import { motion } from "motion/react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import HowToBuySteps from "./components/HowToBuySteps";
import StepByStep from "./components/StepByStep";
import WalletOptions from "./components/WalletOptions";
import { useTheme } from "@/context/ThemeContext";

const HowToBuy = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `How To Buy ${APP_NAME} - Simple Step-by-Step Guide`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Learn how to buy BUDJU Coin in a few simple steps. Connect your wallet, swap SOL for BUDJU, and join the BUDJU parade!",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Learn how to buy BUDJU Coin in a few simple steps. Connect your wallet, swap SOL for BUDJU, and join the BUDJU parade!";
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
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                HOW
              </span>{" "}
              <span className="text-budju-blue">TO BUY BUDJU</span>
            </h1>
            <p
              className={`text-xl ${isDarkMode ? "text-gray-300" : "text-white"}`}
            >
              Join the BUDJU parade in just a few simple steps. Follow this
              guide to get your first BUDJU tokens and become part of our
              vibrant community.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* How To Buy Steps */}
      <HowToBuySteps />

      {/* Step By Step Guide */}
      <StepByStep />

      {/* Wallet Options */}
      <WalletOptions />
    </main>
  );
};

export default HowToBuy;
