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
    window.scrollTo(0, 0);
    document.title = `How To Buy ${APP_NAME} - Simple Step-by-Step Guide`;

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
      <section className="pt-24 pb-16 overflow-hidden px-4">
        <div className="max-w-5xl mx-auto relative">
          {/* Decorative blurs */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-budju-blue/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-budju-pink/15 rounded-full blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto relative z-10"
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-budju-blue/10 border border-budju-blue/20 mb-5">
              <span className="w-2 h-2 rounded-full bg-budju-blue animate-pulse" />
              <span className="text-budju-blue text-xs font-bold uppercase tracking-wider">
                Simple 3-Step Process
              </span>
            </div>

            <h1
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display mb-5 leading-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              How To Buy{" "}
              <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
                BUDJU
              </span>
            </h1>
            <p
              className={`text-base md:text-lg leading-relaxed max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
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
