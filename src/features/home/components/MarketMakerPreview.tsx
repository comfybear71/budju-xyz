import { motion } from "framer-motion";
import Button from "@components/common/Button";
import { useTheme } from "@/context/ThemeContext";

const MarketMakerPreview = () => {
  const { isDarkMode } = useTheme();
  return (
    <section className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-gray-200" : "text-white"}>
              Become a
            </span>{" "}
            <span className="text-budju-blue">Market Maker</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-400" : "text-gray-300"} max-w-3xl mx-auto`}
          >
            Join the BUDJU liquidity pools to earn fees and help build a
            stronger ecosystem
          </p>
          <div className="mt-8">
            <Button as="link" to="/pool" size="lg">
              Explore BUDJU Pools
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default MarketMakerPreview;
