import { useEffect } from "react";
import { motion } from "motion/react";
import Button from "@components/common/Button";
import { ROUTES } from "@constants/routes";
import { useTheme } from "@/context/ThemeContext";

const NotFound = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // Set document title and metadata
    document.title = "Page Not Found - BUDJU Coin";
  }, []);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center py-20 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-lg"
      >
        <img
          src="/images/logo.svg"
          alt="BUDJU Logo"
          className="w-32 h-32 mx-auto mb-8 opacity-50"
        />

        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          <span className="text-budju-pink">404</span>
        </h1>
        <h2
          className={`text-3xl md:text-4xl font-bold mb-6 ${isDarkMode ? "text-white" : "text-budju-white"}`}
        >
          Page Not Found
        </h2>

        <p
          className={`text-xl ${isDarkMode ? "text-gray-400" : "text-white/80"} mb-8`}
        >
          Looks like you've wandered off the BUDJU parade route. Let's get you
          back to the celebration!
        </p>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button as="link" to={ROUTES.HOME} size="lg">
            Return Home
          </Button>

          <Button as="link" to={ROUTES.SHOP} variant="secondary" size="lg">
            Visit Shop
          </Button>
        </div>

        <div className="mt-12 flex justify-center space-x-6">
          <a
            href="http://t.me/budjucoingroup"
            target="_blank"
            rel="noopener noreferrer"
            className={`${isDarkMode ? "text-gray-400 hover:text-budju-blue" : "text-white/70 hover:text-budju-blue"} transition-colors`}
          >
            Telegram
          </a>
          <a
            href="https://x.com/budjucoin?s=21"
            target="_blank"
            rel="noopener noreferrer"
            className={`${isDarkMode ? "text-gray-400 hover:text-budju-blue" : "text-white/70 hover:text-budju-blue"} transition-colors`}
          >
            Twitter
          </a>
        </div>
      </motion.div>
    </div>
  );
};

export default NotFound;
