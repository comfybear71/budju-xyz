import { useEffect } from "react";
import { motion } from "motion/react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import BankIntro from "./components/BankIntro";
import BurnStatistics from "./components/BurnStatistics";
import BankDeposit from "./components/BankDeposit";
import BankTokens from "./components/BankTokens";
import BankTransactions from "./components/BankTransactions";
import { useTheme } from "@/context/ThemeContext";

const Bank = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `Bank of ${APP_NAME} - Deposit, Burn, and Grow`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "The Bank of BUDJU uses revenue to invest in the platform development, provide liquidity, and burn tokens to boost value.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "The Bank of BUDJU uses revenue to invest in the platform development, provide liquidity, and burn tokens to boost value.";
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
                Bank of{" "}
              </span>
              <span className="text-budju-blue">BUDJU</span>
            </h1>
            <p
              className={`text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
            >
              Fuel the future of BUDJU! Deposit into the Bank of BUDJU and watch
              your contribution grow with interest—burning BUDJU coins to boost
              value. The bigger your deposit, the bigger your rewards.
            </p>
          </motion.div>
        </div>
      </section>

     {/* Bank Tokens */}
      <BankTokens />

      {/* Burn Statistics */}
      <BurnStatistics />

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* Bank Introduction */}
      <BankIntro />

      

      

      {/* Bank Transactions */}
      <BankTransactions />

      {/* Bank Deposit Interface */}
      <BankDeposit />
    </main>
  );
};

export default Bank;
