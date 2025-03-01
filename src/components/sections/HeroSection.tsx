import { memo } from "react";
import { motion } from "framer-motion";
import Button from "../common/Button";

interface HeroSectionProps {
  titleImage: string;
  budjuImage: string;
  buyLink: string;
}

const HeroSection = ({ titleImage, budjuImage, buyLink }: HeroSectionProps) => {
  return (
    <section className="relative flex flex-col items-center justify-center pt-24 pb-10 overflow-hidden bg-gradient-to-b from-black to-gray-900">
      <motion.div
        className="w-full max-w-lg px-4 mb-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <img src={titleImage} alt="Budju Title" className="w-full" />
      </motion.div>

      <motion.div
        className="relative w-full mb-12"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        <div className="relative">
          <img
            src={budjuImage}
            alt="Budju"
            className="w-full max-w-xl mx-auto"
          />
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <h1 className="text-4xl font-bold text-center text-white md:text-5xl lg:text-6xl">
              JOIN THE BUDJU
              <br />
              PARADE
            </h1>
          </motion.div>
        </div>
      </motion.div>

      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
      >
        <p className="mb-2 text-xl font-semibold text-light-blue md:text-2xl">
          BUDJU NFT COLLECTION
        </p>
        <p className="text-xl md:text-2xl">
          <span className="font-semibold text-light-blue">COMING</span>{" "}
          <span className="font-semibold text-white">SOON</span>
        </p>
      </motion.div>

      <motion.div
        className="flex flex-col items-center mt-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.3 }}
      >
        <Button variant="hot-pink" size="lg" href={buyLink} external>
          BUY BUDJU
        </Button>

        <motion.div
          className="w-full mt-8 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          <div className="relative flex overflow-x-hidden">
            <div className="animate-marquee whitespace-nowrap">
              <span className="mx-4 text-white text-xl">
                *&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;
              </span>
            </div>
            <div className="absolute top-0 animate-marquee2 whitespace-nowrap">
              <span className="mx-4 text-white text-xl">
                *&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;JOIN THE BUDJU
                PARADE&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
};

export default memo(HeroSection);
