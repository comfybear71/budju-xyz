import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import {
  FaWallet,
  FaDollarSign,
  FaExchangeAlt,
  FaCheckCircle,
} from "react-icons/fa";
import Button from "@components/common/Button";
import { DEX_LINK } from "@constants/addresses";
import { useTheme } from "@/context/ThemeContext";
const phantomLogo = "/images/how-to-buy/phantom-logo.png";
const jupiterLogo = "/images/how-to-buy/jupiter-logo.png";
const solflareLogo = "/images/how-to-buy/solflare-logo.png";
import { ReactElement } from "react";

interface Link {
  label: string;
  url: string;
  external: boolean;
  logo?: string;
  icon?: ReactElement;
}

const steps: {
  id: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  image: string;
  color: string;
  links: Link[];
}[] = [
  {
    id: "create-wallet",
    icon: FaWallet,
    title: "1. Create a wallet with Phantom, Jupiter or Solflare",
    description:
      "Visit phantom.app, jupiter.ag or solflare.com and follow the simple steps to create a new account with the Phantom app, Jupiter app or browser extension.",
    image: "/images/how-to-buy/phantom-wallet.webp",
    color: "bg-blue-600",
    links: [
      { 
        label: "Phantom", 
        url: "https://phantom.app", 
        external: true, 
        logo: phantomLogo, 
      },
      { 
        label: "Jupiter", 
        url: "https://jup.ag", 
        external: true, 
        logo: jupiterLogo, 
      },
      { 
        label: "Solflare", 
        url: "https://www.solflare.com/", 
        external: true, 
        logo: solflareLogo, 
      },
    ],
  },
  {
    id: "get-sol",
    icon: FaDollarSign,
    title: "2. Get some $SOL",
    description:
      "Tap the BUY button in the app to purchase Solana, or deposit $SOL to your Phantom or Jupiter wallet from the crypto exchange of your choice.",
    image: "/images/how-to-buy/buy-sol.webp",
    color: "bg-purple-600",
    links: [],
  },
  {
    id: "swap-for-budju",
    icon: FaExchangeAlt,
    title: "3. Swap $SOL for $BUDJU",
    description:
      "Tap the SWAP icon in your Phantom or Jupiter wallet and paste the $BUDJU token address. Swap your $SOL for $BUDJU.",
    image: "/images/how-to-buy/swap-budju.webp",
    color: "bg-pink-600",
    links: [],
  },
  {
    id: "holder",
    icon: FaCheckCircle,
    title: "YOU ARE $BUDJU HOLDER!",
    description:
      "Congratulations! You now hold BUDJU tokens in your wallet. Welcome to the parade - enjoy the ride!",
    image: "/images/how-to-buy/holder.webp",
    color: "bg-green-600",
    links: [{ label: "BUY BUDJU", url: DEX_LINK, external: false }],
  },
];

const HowToBuySteps = () => {
  const { isDarkMode } = useTheme();
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && stepsRef.current) {
      const stepItems = stepsRef.current.querySelectorAll(".step-item");
      gsap.fromTo(
        stepItems,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.3,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: { trigger: stepsRef.current, start: "top 75%" },
        }
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2
            className={`text-3xl md:text-4xl font-bold mb-4 ${
              isDarkMode ? "text-white" : "text-budju-white"
            }`}
          >
            Step-by-Step Guide
          </h2>
          <p
            className={`text-lg ${
              isDarkMode ? "text-gray-300" : "text-white"
            } max-w-3xl mx-auto`}
          >
            Follow these easy steps to get your BUDJU tokens. If you're new to
            crypto, don't worry – we've made this as simple as possible!
          </p>
        </motion.div>

        <div ref={stepsRef} className="max-w-4xl mx-auto space-y-16">
          {steps.map((step, index) => (
            <div
              key={step.id}
              id={step.id}
              className={`step-item flex flex-col ${
                index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
              } gap-8 items-center`}
            >
              <div className="w-full md:w-1/2 space-y-4">
                <div
                  className={`${step.color} w-16 h-16 rounded-full flex items-center justify-center mb-2`}
                >
                  <step.icon size={32} className="text-white" />
                </div>
                <h3
                  className={`text-2xl font-bold ${
                    isDarkMode ? "text-white" : "text-budju-white"
                  }`}
                >
                  {step.title}
                </h3>
                <p
                  className={
                    isDarkMode ? "text-gray-300 text-lg" : "text-white text-lg"
                  }
                >
                  {step.description}
                </p>
                {step.links.length > 0 && (
                  <div className="flex flex-col gap-4 pt-2 md:flex-row">
                    {step.links.map((link, linkIndex) => (
                      <Button
                        key={linkIndex}
                        as="a"
                        href={link.url}
                        target={link.external ? "_blank" : undefined}
                        rel={link.external ? "noopener noreferrer" : undefined}
                        variant={linkIndex === 0 ? "primary" : "secondary"}
                        size="md"
                        className={`w-full md:flex-1 ${
                          link.label === "Phantom"
                            ? "bg-gradient-to-br from-purple-300 to-purple-900"
                            : link.label === "Jupiter"
                            ? "bg-gradient-to-br from-orange-300 to-red-800"
                            : link.label === "Solflare"
                            ? "bg-gradient-to-br from-green-300 to-green-800"
                            : "bg-gradient-to-br from-blue-500 to-blue-900"
                        } text-white font-bold text-xl py-4 px-4 rounded-lg text-center transition-all duration-300 hover:shadow-budju-lg hover:-translate-y-1`}
                      >
                        <div className="flex items-center justify-center">
                          {link.logo && (
                            <img
                              src={link.logo}
                              alt={`${link.label} logo`}
                              className="w-8 h-8 mr-3"
                            />
                          )}
                          {link.label}
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p
            className={
              isDarkMode ? "text-gray-400 mt-4 text-lg" : "text-white/80 mt-4 text-lg"
            }
          >
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