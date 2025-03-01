import { useState, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "../common/Button";

interface NFTSlideshowProps {
  images: string[];
  targetHolders: number;
  currentHolders: number;
}

const NFTSlideshow = ({
  images,
  targetHolders,
  currentHolders,
}: NFTSlideshowProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === images.length - 1 ? 0 : prevIndex + 1,
      );
    }, 500);

    return () => clearInterval(interval);
  }, [images.length]);

  const slideshowVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  const direction = 1;

  return (
    <section className="py-12 bg-black">
      <div className="container px-4 mx-auto">
        <div className="flex flex-col items-center">
          <motion.div
            className="relative w-full max-w-md h-72 md:h-96 mb-8 overflow-hidden rounded-lg"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <AnimatePresence initial={false} custom={direction}>
              <motion.img
                key={currentImageIndex}
                src={images[currentImageIndex]}
                alt={`Budju NFT ${currentImageIndex + 1}`}
                className="absolute inset-0 object-cover w-full h-full"
                custom={direction}
                variants={slideshowVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
              />
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Button variant="hot-pink" size="lg">
              NFT'S COMING SOON
            </Button>

            <motion.h3
              className="mt-6 text-lg text-center text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              BUDJU NFT's MINTED AFTER REACH <br />
              <span className="flex items-center justify-center mt-2">
                <span className="text-xl">🎯</span>
                <span className="mx-2 text-2xl font-bold text-light-blue">
                  {currentHolders}
                </span>
                <span className="text-2xl font-bold text-light-blue">
                  / {targetHolders}
                </span>
                <span className="text-xl">🎯</span>
              </span>
            </motion.h3>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default memo(NFTSlideshow);
