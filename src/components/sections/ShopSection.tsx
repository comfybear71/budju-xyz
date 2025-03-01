import { useState, useCallback, useMemo, memo } from "react";
import { motion } from "framer-motion";
import { Product } from "@/types";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";
import SectionTitle from "../common/SectionTitle";
import ProductCard from "../common/ProductCard";

interface ShopSectionProps {
  products: Array<Product>;
}

type Category = "ladies" | "mens" | "caps" | "special";

const ShopSection = ({ products }: ShopSectionProps) => {
  const [activeCategory, setActiveCategory] = useState<Category>("ladies");
  const [ref, controls] = useAnimationObserver();

  const filteredProducts = useMemo(() => {
    return products.filter((product) => product.category === activeCategory);
  }, [products, activeCategory]);

  const handleCategoryChange = useCallback((category: Category) => {
    setActiveCategory(category);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 },
    },
  };

  const categories: { id: Category; label: string }[] = [
    { id: "ladies", label: "LADIES OF BUDJU" },
    { id: "mens", label: "MENS OF BUDJU" },
    { id: "caps", label: "CAPS OF BUDJU" },
    { id: "special", label: "SPECIAL ITEMS" },
  ];

  return (
    <section className="py-12 bg-black" id="shop">
      <div className="container px-4 mx-auto">
        <SectionTitle whiteText="Shop of" blueText="Budju" />

        <motion.div
          className="max-w-3xl mx-auto mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-center text-gray-300">
            <b>
              "Step into the world of Budju's Shop, where bold fashion meets
              unstoppable vibes! Rock your favorite stylish clothing and
              exclusive merchandise, all stamped with the iconic Budju
              logo—perfect for turning heads and making a statement globally.
              Whether it's gifts for friends, family, or a Christmas haul, our
              Shopify-powered store has you covered. Even better? Score your
              Budju gear with Solana dollars or our very own Budju Coin—because
              owning the look should feel as cutting-edge as it looks. Grab your
              merch today and join the parade, Budju's!"
            </b>
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-4 mb-8">
          {categories.map((category) => (
            <motion.button
              key={category.id}
              className={`px-4 py-2 font-semibold rounded-full ${
                activeCategory === category.id
                  ? "bg-light-blue text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
              onClick={() => handleCategoryChange(category.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {category.label}
            </motion.button>
          ))}
        </div>

        <motion.div
          ref={ref}
          className="py-4"
          variants={containerVariants}
          initial="hidden"
          animate={controls}
        >
          <motion.h3 className="mb-4 text-xl font-bold" variants={itemVariants}>
            <span className="text-light-blue">
              {
                categories
                  .find((c) => c.id === activeCategory)
                  ?.label.split(" ")[0]
              }
            </span>{" "}
            <span className="text-white">
              {categories
                .find((c) => c.id === activeCategory)
                ?.label.split(" ")
                .slice(1)
                .join(" ")}
            </span>
          </motion.h3>

          <div className="relative">
            <div className="flex overflow-x-auto pb-6 snap-x snap-mandatory gap-6 scrollbar-hide">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product, _) => (
                  <motion.div
                    key={product.id}
                    className="snap-center"
                    variants={itemVariants}
                  >
                    <ProductCard product={product} />
                  </motion.div>
                ))
              ) : (
                <motion.div
                  className="py-10 text-center w-full"
                  variants={itemVariants}
                >
                  <p className="text-gray-400">
                    More {activeCategory} products coming soon!
                  </p>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          className="mt-10 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <a
            href="https://shop.budjucoin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-light-blue hover:underline"
          >
            Visit the full Shop of Budju for more dope gear!
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default memo(ShopSection);
