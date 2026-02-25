import { useEffect } from "react";
import { motion } from "framer-motion";
import { APP_NAME } from "@constants/config";
import BurnStatistics from "./components/BurnStatistics";
import { useTheme } from "@/context/ThemeContext";

const Burn = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Burn - ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        `Track the burning of ${APP_NAME} tokens to boost value and reduce supply.`,
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content = `Track the burning of ${APP_NAME} tokens to boost value and reduce supply.`;
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
              Burn
              <span className="bg-gradient-to-r from-red-400 to-orange-500 bg-clip-text text-transparent">
                {" "}BUDJU{" "}
              </span>
              Burn
            </h1>
            <p
              className={`text-lg ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              Track the burning of {APP_NAME} tokens to boost value and reduce
              supply.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Burn Statistics */}
      <BurnStatistics />
    </main>
  );
};

export default Burn;
