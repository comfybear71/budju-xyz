import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { FaShoppingCart, FaExternalLinkAlt } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

const SHOP_URL = "https://shop-of-budjus.myspreadshop.com.au";

const FEATURED = [
  {
    title: "Tees & Shirts",
    image: "/images/shop00.jpg",
    accent: "pink",
  },
  {
    title: "Hoodies & Sweaters",
    image: "/images/shop03.jpg",
    accent: "blue",
  },
  {
    title: "Caps & Accessories",
    image: "/images/shop06.jpg",
    accent: "pink",
  },
  {
    title: "Limited Drops",
    image: "/images/shop09.jpg",
    accent: "blue",
  },
];

const ShopHighlight = () => {
  const { isDarkMode } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollIndex, setScrollIndex] = useState(0);

  // Auto-scroll on mobile
  useEffect(() => {
    const interval = setInterval(() => {
      setScrollIndex((prev) => (prev + 1) % FEATURED.length);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      const child = scrollRef.current.children[scrollIndex] as HTMLElement;
      if (child) {
        scrollRef.current.scrollTo({
          left: child.offsetLeft - 16,
          behavior: "smooth",
        });
      }
    }
  }, [scrollIndex]);

  return (
    <section className="py-16 md:py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-3 mb-4">
            <FaShoppingCart
              className={`w-6 h-6 ${
                isDarkMode ? "text-budju-pink" : "text-budju-pink-dark"
              }`}
            />
            <h2
              className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Shop of{" "}
              <span className="bg-gradient-to-r from-budju-pink via-budju-blue to-budju-pink bg-clip-text text-transparent">
                BUDJU's
              </span>
            </h2>
          </div>
          <p
            className={`text-base max-w-2xl mx-auto ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            Rep the movement. 100% of profits fuel the BUY BURN BUDJU
            initiative — every purchase makes an impact.
          </p>
        </motion.div>

        {/* Product Cards — grid on desktop, horizontal scroll on mobile */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto md:grid md:grid-cols-4 md:overflow-visible pb-4 md:pb-0 snap-x snap-mandatory scrollbar-hide"
        >
          {FEATURED.map((item, index) => (
            <motion.a
              key={item.title}
              href={SHOP_URL}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className={`group relative flex-shrink-0 w-[70vw] md:w-auto snap-center rounded-2xl p-[1px] transition-all duration-300 ${
                item.accent === "pink"
                  ? isDarkMode
                    ? "bg-gradient-to-br from-budju-pink/40 via-budju-pink/10 to-budju-pink/40 hover:from-budju-pink/60 hover:to-budju-pink/60"
                    : "bg-gradient-to-br from-budju-pink/30 via-budju-pink/10 to-budju-pink/30 hover:from-budju-pink/50 hover:to-budju-pink/50"
                  : isDarkMode
                    ? "bg-gradient-to-br from-budju-blue/40 via-budju-blue/10 to-budju-blue/40 hover:from-budju-blue/60 hover:to-budju-blue/60"
                    : "bg-gradient-to-br from-budju-blue/30 via-budju-blue/10 to-budju-blue/30 hover:from-budju-blue/50 hover:to-budju-blue/50"
              }`}
            >
              <div
                className={`rounded-2xl overflow-hidden h-full ${
                  isDarkMode ? "bg-[#0a0a1f]/95" : "bg-white/90"
                } backdrop-blur-sm transition-all duration-300 group-hover:translate-y-[-2px]`}
              >
                {/* Image */}
                <div className="aspect-square overflow-hidden">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3
                      className={`text-sm font-bold font-display ${
                        isDarkMode ? "text-white" : "text-gray-900"
                      }`}
                    >
                      {item.title}
                    </h3>
                    <FaExternalLinkAlt
                      className={`w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    />
                  </div>
                  <div
                    className={`inline-flex items-center gap-1.5 text-xs font-bold mt-2 ${
                      item.accent === "pink"
                        ? "text-budju-pink"
                        : isDarkMode
                          ? "text-budju-blue"
                          : "text-blue-600"
                    } group-hover:gap-2.5 transition-all`}
                  >
                    Browse
                    <span className="transition-transform group-hover:translate-x-1">
                      &rarr;
                    </span>
                  </div>
                </div>
              </div>
            </motion.a>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mt-10"
        >
          <a
            href={SHOP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all duration-300 hover:scale-105 ${
              isDarkMode
                ? "bg-gradient-to-r from-budju-pink to-budju-blue text-white shadow-lg shadow-budju-pink/20 hover:shadow-budju-pink/40"
                : "bg-gradient-to-r from-budju-pink to-budju-blue text-white shadow-lg shadow-budju-pink/30 hover:shadow-budju-pink/50"
            }`}
          >
            <FaShoppingCart className="w-4 h-4" />
            Visit the Full Shop
            <FaExternalLinkAlt className="w-3 h-3" />
          </a>
        </motion.div>
      </div>
    </section>
  );
};

export default ShopHighlight;
