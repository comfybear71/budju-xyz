import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import {
  FaWallet,
  FaDollarSign,
  FaExchangeAlt,
  FaCheckCircle,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { DEX_LINK } from "@constants/addresses";

const steps = [
  {
    id: "create-wallet",
    icon: FaWallet,
    title: "1. Create a wallet with Phantom or Jupiter",
    description:
      "Visit phantom.app or jupiter.ag and follow the simple steps to create a new account with the Phantom app, Jupiter app or browser extension.",
    image: "src/assets/images/how-to-buy/phantom-wallet.webp",
    color: "bg-blue-600",
    links: [
      { label: "Download Phantom", url: "https://phantom.app", external: true },
      { label: "Download Jupiter", url: "https://jup.ag", external: true },
    ],
  },
  {
    id: "get-sol",
    icon: FaDollarSign,
    title: "2. Get some $SOL",
    description:
      "Tap the BUY button in the app to purchase Solana, or deposit $SOL to your Phantom or Jupiter wallet from the crypto exchange of your choice.",
    image: "src/assets/images/how-to-buy/buy-sol.webp",
    color: "bg-purple-600",
    links: [],
  },
  {
    id: "swap-for-budju",
    icon: FaExchangeAlt,
    title: "3. Swap $SOL for $BUDJU",
    description:
      "Tap the SWAP icon in your Phantom or Jupiter wallet and paste the $BUDJU token address. Swap your $SOL for $BUDJU.",
    image: "src/assets/images/how-to-buy/swap-budju.webp",
    color: "bg-pink-600",
    links: [],
  },
  {
    id: "holder",
    icon: FaCheckCircle,
    title: "YOU ARE $BUDJU HOLDER!",
    description:
      "Congratulations! You now hold BUDJU tokens in your wallet. Welcome to the parade - enjoy the ride!",
    image: "src/assets/images/how-to-buy/holder.webp",
    color: "bg-green-600",
    links: [{ label: "BUY BUDJU", url: DEX_LINK, external: true }],
  },
];

const HowToBuySteps = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && stepsRef.current) {
      const stepItems = stepsRef.current.querySelectorAll(".step-item");

      // Add animation for each step item
      gsap.fromTo(
        stepItems,
        {
          opacity: 0,
          y: 50,
        },
        {
          opacity: 1,
          y: 0,
          stagger: 0.3,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 75%",
          },
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
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
            Step-by-Step Guide
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Follow these easy steps to get your BUDJU tokens. If you're new to
            crypto, don't worry – we've made this as simple as possible!
          </p>
        </motion.div>

        {/* Steps */}
        <div ref={stepsRef} className="max-w-4xl mx-auto space-y-16">
          {steps.map((step, index) => (
            <div
              key={step.id}
              id={step.id}
              className={`step-item flex flex-col ${
                index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
              } gap-8 items-center`}
            >
              {/* Step Content */}
              <div className="w-full md:w-1/2 space-y-4">
                <div
                  className={`${step.color} w-16 h-16 rounded-full flex items-center justify-center mb-2`}
                >
                  <step.icon size={32} className="text-white" />
                </div>

                <h3 className="text-2xl font-bold text-white">{step.title}</h3>
                <p className="text-gray-300 text-lg">{step.description}</p>

                {step.links.length > 0 && (
                  <div className="flex flex-wrap gap-3 pt-2">
                    {step.links.map((link, linkIndex) => (
                      <Button
                        key={linkIndex}
                        as="a"
                        href={link.url}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        variant={linkIndex === 0 ? "primary" : "secondary"}
                        size="md"
                      >
                        {link.label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step Image */}
              {/* <div className="w-full md:w-1/2">
                <div className="bg-gray-800 rounded-xl overflow-hidden shadow-budju-lg border border-gray-700 transition-transform hover:scale-105 duration-500">
                  <img
                    src={step.image}
                    alt={step.title}
                    className="w-full h-auto"
                  />
                </div>
              </div> */}
            </div>
          ))}
        </div>

        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <Button
            as="a"
            href={DEX_LINK}
            target="_blank"
            rel="noopener noreferrer"
            size="lg"
            className="animate-pulse"
          >
            BUY BUDJU NOW
          </Button>

          <p className="text-gray-400 mt-4">
            Have questions? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram
            </a>{" "}
            for community support!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default HowToBuySteps;
