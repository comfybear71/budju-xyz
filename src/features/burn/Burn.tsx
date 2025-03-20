import { useState, useEffect } from "react";
import { motion } from "motion/react"; // Adjust to 'framer-motion' if needed
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import BurnStatistics from "./components/BurnStatistics";
import { useTheme } from "@/context/ThemeContext";

const Burn = () => {
  const { isDarkMode } = useTheme();
  const [isMobile, setIsMobile] = useState(false);
  const [phantomDeepLink, setPhantomDeepLink] = useState<string>("");

  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `Burn - ${APP_NAME}`;

    // Update meta description
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

    // Detect mobile device
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
      setIsMobile(isMobileDevice);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleOpenInPhantom = () => {
    const targetUrl = "https://budju-six.vercel.app/";
    const refUrl = import.meta.env.DEV
      ? "https://192.168.20.9:5173/"
      : "https://budju-six.vercel.app/";
    const deepLink = `https://phantom.app/ul/browse/${encodeURIComponent(targetUrl)}?ref=${encodeURIComponent(refUrl)}`;
    setPhantomDeepLink(deepLink);
    console.log("Generated Phantom browse deep link:", deepLink);
  };

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
            <span className="text-5xl">🔥</span>{" "}
            <span className="text-budju-blue">Burn</span>{" "}
              <span className={isDarkMode ? "text-white" : "text-budju-white"}>
                {APP_NAME}{" "}
              </span>
              <span className="text-budju-blue">Burn</span>
              {" "}<span className="text-5xl">🔥</span>
            </h1>
            <p
              className={`text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
            >
              Track the burning of {APP_NAME} tokens to boost value and reduce supply.
            </p>
            {isMobile && (
              <button onClick={handleOpenInPhantom} className="deeplink-button mt-4">
                Open in Phantom
              </button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* Burn Statistics */}
      <BurnStatistics />

      {phantomDeepLink && (
        <div className="deeplink-section">
          <p>Click to open in Phantom’s in-app browser:</p>
          <a href={phantomDeepLink} className="deeplink-button">
            Open in Phantom
          </a>
        </div>
      )}
    </main>
  );
};

export default Burn;