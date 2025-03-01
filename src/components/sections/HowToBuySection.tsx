import { memo } from "react";
import { motion } from "framer-motion";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";
import SectionTitle from "../common/SectionTitle";
import Button from "../common/Button";

interface Step {
  title: string;
  description: string;
  index: number;
}

const steps: Step[] = [
  {
    index: 1,
    title: "Create a wallet with Phantom or Jupiter",
    description:
      "Visit phantom.app or jupiter.ag and follow the simple steps to create a new account with the Phantom app, Jupiter app or browser extension.",
  },
  {
    index: 2,
    title: "Get some $SOL",
    description:
      "Tap the BUY button in the app to purchase Solana, or deposit $SOL to your Phantom or Jupiter wallet from the crypto exchange of your choice.",
  },
  {
    index: 3,
    title: "Swap $SOL for $BUDJU",
    description:
      "Tap the SWAP icon in your Phantom or Jupiter wallet and paste the $BUDJU token address. Swap your $SOL for $BUDJU.",
  },
];

const HowToBuySection = () => {
  const [ref, controls] = useAnimationObserver();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <section className="py-12 bg-black" id="how-to-buy">
      <div className="container px-4 mx-auto">
        <SectionTitle whiteText="HOW" blueText="TO BUY BUDJU" />

        <motion.div
          ref={ref}
          className="grid grid-cols-1 gap-6 md:gap-8 md:grid-cols-2 lg:grid-cols-4"
          variants={containerVariants}
          initial="hidden"
          animate={controls}
        >
          {steps.map((step) => (
            <motion.div
              key={step.index}
              className="p-6 border border-gray-800 rounded-lg bg-gradient-to-b from-gray-900 to-black"
              variants={itemVariants}
            >
              <div className="flex items-center mb-4">
                <span className="flex items-center justify-center w-10 h-10 mr-3 text-lg font-bold text-black rounded-full bg-light-blue">
                  {step.index}
                </span>
                <h3 className="text-lg font-bold text-white">{step.title}</h3>
              </div>
              <p className="text-gray-300">{step.description}</p>
            </motion.div>
          ))}

          <motion.div
            className="flex flex-col items-center justify-center p-6 text-center border border-gray-800 rounded-lg bg-gradient-to-b from-gray-900 to-black"
            variants={itemVariants}
          >
            <h3 className="mb-4 text-xl font-bold text-light-blue">
              YOU ARE $BUDJU HOLDER!
            </h3>
            <Button
              variant="hot-pink"
              size="lg"
              href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
              external
            >
              BUY BUDJU
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default memo(HowToBuySection);
