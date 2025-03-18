import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { NFT_TARGET_HOLDERS } from "@constants/addresses";
import { useTheme } from "@/context/ThemeContext";

const shopImages = [
  "/images/shop00.jpg",
  "/images/shop01.jpg",
  "/images/shop02.jpg",
  "/images/shop03.jpg",
  "/images/shop04.jpg",
  "/images/shop05.jpg",
  "/images/shop06.jpg",
];


const ShopOfBudjusPreview = () => {
  const { isDarkMode } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [holderCount, setHolderCount] = useState(123);
  const [autoplay, setAutoplay] = useState(true);
  const sliderRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const nextSlide = () =>
    setCurrentIndex((prevIndex) => (prevIndex + 1) % shopImages.length);
  const prevSlide = () =>
    setCurrentIndex((prevIndex) =>
      prevIndex === 0 ? shopImages.length - 1 : prevIndex - 1,
    );

  useEffect(() => {
    if (autoplay) intervalRef.current = setInterval(nextSlide, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoplay]);

  const handleMouseEnter = () => setAutoplay(false);
  const handleMouseLeave = () => setAutoplay(true);

  useEffect(() => {
    if (sliderRef.current) {
      sliderRef.current.addEventListener("mousemove", (e) => {
        const { left, top, width, height } =
          sliderRef.current!.getBoundingClientRect();
        const x = (e.clientX - left) / width;
        const y = (e.clientY - top) / height;
        const tiltX = 10 * (y - 0.5);
        const tiltY = -10 * (x - 0.5);
        gsap.to(sliderRef.current, {
          rotateX: tiltX,
          rotateY: tiltY,
          transformPerspective: 1000,
          duration: 0.4,
          ease: "power2.out",
        });
      });
      sliderRef.current.addEventListener("mouseleave", () => {
        gsap.to(sliderRef.current, {
          rotateX: 0,
          rotateY: 0,
          duration: 0.7,
          ease: "elastic.out(1, 0.5)",
        });
      });
    }
  }, []);

  useEffect(() => {
    const fetchHolderCount = () =>
      setHolderCount(Math.floor(Math.random() * 30) + 120);
    fetchHolderCount();
    const interval = setInterval(fetchHolderCount, 30000);
    return () => clearInterval(interval);
  }, []);

  const percentComplete = Math.min(
    100,
    Math.round((holderCount / NFT_TARGET_HOLDERS) * 100),
  );

  return (
    <section className="py-20">
      <div className="budju-container">
        <div className="flex flex-col lg:flex-row items-center gap-12">
        <div className="w-full lg:w-1/2">
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className={`bg-gradient-to-br ${isDarkMode ? "from-gray-800 to-gray-900" : "from-gray-900 to-black"} p-8 rounded-xl border border-gray-800`}
            >
              <h3 className="text-2xl md:text-3xl font-bold mb-4 text-budju-pink">
                SHOP OF BUDJU'S is Now Open
              </h3>
              <p
                className={`text-lg ${isDarkMode ? "text-gray-400" : "text-gray-300"} mb-6`}
              >
                The Shop of Budju’s is officially open, and it’s packed with fantastic goodies 
                you won’t want to miss! From unique treasures to must-have items, there’s 
                something for everyone to snag. Best of all, 100% of the profits fuel the BUY BURN BUDJU initiative, 
                making every purchase a win for the movement. So, swing by, grab some great stuff, 
                and shop with purpose—your support keeps the Budju vibe blazing!

              </p>
              {/* <div className="mb-6">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress to minting</span>
                  <span className="text-budju-blue font-bold">
                    {holderCount} / {NFT_TARGET_HOLDERS} holders
                  </span>
                </div>
                <div
                  className={`h-4 ${isDarkMode ? "bg-gray-700" : "bg-gray-800"} rounded-full overflow-hidden`}
                >
                  <div
                    className="h-full bg-gradient-to-r from-budju-pink to-budju-blue transition-all duration-1000 ease-out"
                    style={{ width: `${percentComplete}%` }}
                  />
                </div>
              </div> */}
              <div className="flex flex-col space-y-6">
                <div
                  className={`${isDarkMode ? "bg-gray-700/50" : "bg-gray-800/50"} p-4 rounded-lg`}
                >
                  <h4
                    className={`text-xl font-semibold mb-2 ${isDarkMode ? "text-gray-200" : "text-white"}`}
                  >
                    Merch Collection Highlights
                  </h4>
                  <ul
                    className={`space-y-2 ${isDarkMode ? "text-gray-400" : "text-gray-300"}`}
                  >
                     <li className="flex items-center">
                        <span className="mr-2">●</span>Iconic BUDJU tees and hoodies in bold designs
                    </li>
                    <li className="flex items-center">
                        <span className="mr-2">●</span>Limited edition drops—get ‘em before they’re gone
                    </li>
                    <li className="flex items-center">
                        <span className="mr-2">●</span>Exclusive caps and accessories for true holders
                    </li>
                    <li className="flex items-center">
                        <span className="mr-2">●</span>100% profits to BUY BURN BUDJU
                    </li>
                  </ul>
                </div>
                <Button
                    size="lg"
                    fullWidth
                    as="a" // Changed from "link" to "a" for external linking
                    href="https://shop.budjucoin.com" // Replaced to="/shop" with external URL
                    target="_blank" // Opens in a new window
                    rel="noopener noreferrer" // Security best practice
                    >
                    Let's Go Shopping
                </Button>
              </div>
            </motion.div>
          </div>
          <div
            className="w-full lg:w-1/2"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="text-center mb-6"
            >
              <h2 className="text-3xl md:text-4xl font-bold">
                <span className="text-budju-blue">SHOP</span>{" "}
                <span className={isDarkMode ? "text-gray-200" : "text-white"}>
                  of BUDJU's
                </span>
              </h2>
              {/* <p className="text-xl mt-2">
                <span className="text-budju-blue">COMING</span>{" "}
                <span className={isDarkMode ? "text-gray-200" : "text-white"}>
                  SOON
                </span>
              </p> */}
            </motion.div>
            <div
              ref={sliderRef}
              className="relative aspect-square max-w-md mx-auto rounded-xl overflow-hidden shadow-lg nft-card-container"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                  className="w-full h-full nft-card"
                >
                  <img
                    src={shopImages[currentIndex]}
                    alt={`BUDJU NFT #${currentIndex + 1}`}
                    className="w-full h-full object-cover"
                  />
                </motion.div>
              </AnimatePresence>
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                {shopImages.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-3 h-3 rounded-full transition-all ${currentIndex === index ? "bg-budju-pink scale-125" : isDarkMode ? "bg-gray-600" : "bg-gray-400 opacity-70"}`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
              <button
                onClick={prevSlide}
                className={`absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full ${isDarkMode ? "bg-gray-700/30 hover:bg-gray-600/50" : "bg-black/30 hover:bg-black/50"} text-white transition-colors`}
                aria-label="Previous NFT"
              >
                ←
              </button>
              <button
                onClick={nextSlide}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full ${isDarkMode ? "bg-gray-700/30 hover:bg-gray-600/50" : "bg-black/30 hover:bg-black/50"} text-white transition-colors`}
                aria-label="Next NFT"
              >
                →
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
};

export default ShopOfBudjusPreview;
