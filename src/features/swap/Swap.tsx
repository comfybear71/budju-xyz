import { useEffect } from "react";
import { motion } from "framer-motion";
import { APP_NAME } from "@constants/config";
import SwapTool from "./components/SwapTool"; // Relative path from src/features/swap/
import { useTheme } from "@/context/ThemeContext";

const Swap = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Swap - ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Swap your tokens with BUDJU on the Bank of BUDJU platform.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Swap your tokens with BUDJU on the Bank of BUDJU platform.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <main>
      {/* Hero Section */}
      <section
        className={`pt-16 pb-12 md:pt-24 md:pb-16 ${isDarkMode ? "bg-gradient-to-b from-budju-black to-gray-900" : "bg-gradient-to-b from-budju-pink-light to-budju-pink"}`}
      >
        <div className="budju-container px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1
              className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6`}
            >
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                Swap with{" "}
              </span>
              <span className="text-budju-blue">BUDJU</span>
            </h1>
            <p
              className={`text-base sm:text-lg md:text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
            >
              Easily swap your tokens with BUDJU to participate in the ecosystem.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Swap Interface */}
      <SwapTool />
    </main>
  );
};

export default Swap;