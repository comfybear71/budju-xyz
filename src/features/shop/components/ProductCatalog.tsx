import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaFilter,
  FaSortAmountDown,
  FaShoppingCart,
  FaSearch,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { useProducts, Product } from "../context/ProductContext";
import { createTiltEffect } from "@/lib/utils/animation";
import ProductCard from "./ProductCard";

interface ProductCatalogProps {
  onCartClick: () => void;
}

// Product category type
type Category = "all" | "mens" | "ladies" | "caps" | "special";

// Sort options
type SortOption = "name" | "price-low" | "price-high";

const ProductCatalog = ({ onCartClick }: ProductCatalogProps) => {
  const { products, cartCount } = useProducts();
  const catalogRef = useRef<HTMLDivElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);

  // State for filtering and sorting
  const [selectedCategory, setSelectedCategory] = useState<Category>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [searchQuery, setSearchQuery] = useState("");

  // Apply filters and sort
  const filteredProducts = products.filter((product) => {
    // Apply category filter
    const categoryMatch =
      selectedCategory === "all" || product.category === selectedCategory;

    // Apply search filter
    const searchMatch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  // Apply sorting
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "price-low":
        return a.price - b.price;
      case "price-high":
        return b.price - a.price;
      default:
        return 0;
    }
  });

  // Handle category change
  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category);
  };

  // Handle sort change
  const handleSortChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(event.target.value as SortOption);
  };

  // Animation for product cards
  useEffect(() => {
    if (productGridRef.current) {
      const cards = productGridRef.current.querySelectorAll(".product-card");

      // Reset animations when products change
      gsap.set(cards, { clearProps: "all" });

      // Animate cards appearance
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
          scale: 0.95,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.05,
          duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: productGridRef.current,
            start: "top 80%",
          },
        },
      );

      // Add tilt effect to each card
      cards.forEach((card) => {
        createTiltEffect(card, 5);
      });
    }
  }, [sortedProducts]);

  return (
    <section
      ref={catalogRef}
      id="products"
      className="py-20 bg-gradient-to-b from-gray-900 to-budju-black"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">OUR</span>{" "}
            <span className="text-budju-blue">PRODUCTS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Browse our collection of official BUDJU merchandise. Express
            yourself with our stylish apparel and accessories.
          </p>
        </motion.div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          {/* Category Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center mr-2 text-gray-400">
              <FaFilter className="mr-2" />
              <span>Filter:</span>
            </div>

            {(["all", "mens", "ladies", "caps", "special"] as const).map(
              (category) => (
                <button
                  key={category}
                  onClick={() => handleCategoryChange(category)}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize transition-colors ${
                    selectedCategory === category
                      ? "bg-budju-blue text-white"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}
                >
                  {category === "all" ? "All Products" : category}
                </button>
              ),
            )}
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            {/* Search */}
            <div className="relative flex-grow">
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="budju-input w-full pl-10"
              />
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" />
            </div>

            {/* Sort */}
            <div className="flex items-center bg-gray-800 rounded-lg px-3 py-2">
              <FaSortAmountDown className="text-gray-400 mr-2" />
              <select
                value={sortBy}
                onChange={handleSortChange}
                className="bg-transparent text-gray-300 border-none focus:outline-none"
              >
                <option value="name">Name</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
            </div>

            {/* Cart Button (mobile only) */}
            <div className="block md:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={onCartClick}
                className="relative"
              >
                <FaShoppingCart />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-budju-pink text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                    {cartCount}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        <div
          ref={productGridRef}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          {sortedProducts.length > 0 ? (
            sortedProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))
          ) : (
            <div className="col-span-full py-12 text-center text-gray-400">
              No products found matching your filters.
            </div>
          )}
        </div>

        {/* Product Count and Reset */}
        <div className="mt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-gray-400 mb-4 sm:mb-0">
            Showing {sortedProducts.length} of {products.length} products
          </p>

          {(selectedCategory !== "all" || searchQuery) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCategory("all");
                setSearchQuery("");
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};

export default ProductCatalog;
