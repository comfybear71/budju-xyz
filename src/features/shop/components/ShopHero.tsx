// src/features/shop/components/ShopHero.tsx
import { motion } from "framer-motion";

interface ShopHeroProps {
  onCartClick: () => void;
  isDarkMode: boolean; // Added isDarkMode to the interface
}

const ShopHero = ({ onCartClick, isDarkMode }: ShopHeroProps) => {
  return (
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
              Shop of{" "}
            </span>
            <span className="text-budju-blue">BUDJU</span>
          </h1>
          <p
            className={`text-xl ${isDarkMode ? "text-gray-300" : "text-budju-white"}`}
          >
            Official BUDJU merchandise store - clothing, accessories, and
            collectibles for the BUDJU community. Pay with crypto.
          </p>
          <button
            onClick={onCartClick}
            className="mt-6 bg-budju-pink hover:bg-pink-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
          >
            View Cart
          </button>
        </motion.div>
      </div>
    </section>
  );
};

export default ShopHero;