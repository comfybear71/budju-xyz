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
import { useTheme } from "@/context/ThemeContext";

const phantomLogo = "/images/how-to-buy/phantom-logo.png";
const jupiterLogo = "/images/how-to-buy/jupiter-logo.png";
const solflareLogo = "/images/how-to-buy/solflare-logo.png";

interface Link {
  label: string;
  url: string;
  external: boolean;
  logo?: string;
}

const steps = [
  {
    id: "create-wallet",
    icon: FaWallet,
    title: "Create a Wallet",
    step: "01",
    description:
      "Visit phantom.app, jupiter.ag or solflare.com and follow the simple steps to create a new account with the Phantom app, Jupiter app or browser extension.",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    iconBg: "bg-purple-500/15",
    links: [
      { label: "Phantom", url: "https://phantom.app", external: true, logo: phantomLogo },
      { label: "Jupiter", url: "https://jup.ag", external: true, logo: jupiterLogo },
      { label: "Solflare", url: "https://www.solflare.com/", external: true, logo: solflareLogo },
    ],
  },
  {
    id: "get-sol",
    icon: FaDollarSign,
    title: "Get Some $SOL",
    step: "02",
    description:
      "Tap the BUY button in the app to purchase Solana, or deposit $SOL to your Phantom or Jupiter wallet from the crypto exchange of your choice.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    iconBg: "bg-blue-500/15",
    links: [],
  },
  {
    id: "swap-for-budju",
    icon: FaExchangeAlt,
    title: "Swap $SOL for $BUDJU",
    step: "03",
    description:
      "Tap the SWAP icon in your Phantom or Jupiter wallet and paste the $BUDJU token address. Swap your $SOL for $BUDJU.",
    color: "text-budju-pink",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    iconBg: "bg-pink-500/15",
    links: [],
  },
  {
    id: "holder",
    icon: FaCheckCircle,
    title: "You're a $BUDJU Holder!",
    step: "",
    description:
      "Congratulations! You now hold BUDJU tokens in your wallet. Welcome to the parade — enjoy the ride!",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/20",
    iconBg: "bg-green-500/15",
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
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.15,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: stepsRef.current, start: "top 80%" },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Step-by-Step{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Guide
            </span>
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Follow these easy steps to get your BUDJU tokens. If you're new to
            crypto, don't worry — we've made this as simple as possible!
          </p>
        </motion.div>

        <div ref={stepsRef} className="space-y-4 max-w-3xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.id}
              id={step.id}
              className={`step-item p-5 rounded-xl border transition-all duration-300 hover:scale-[1.01] ${
                isDarkMode
                  ? `bg-[#0c0c20]/60 ${step.border} hover:border-white/[0.12]`
                  : `bg-white/60 border-gray-200/40 hover:border-gray-300/60`
              } backdrop-blur-sm`}
            >
              <div className="flex items-start gap-4">
                {/* Step number + icon */}
                <div className="flex-shrink-0">
                  <div
                    className={`w-12 h-12 rounded-xl ${step.iconBg} flex items-center justify-center relative`}
                  >
                    <step.icon size={20} className={step.color} />
                    {step.step && (
                      <span
                        className={`absolute -top-1 -right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          isDarkMode
                            ? "bg-white/[0.08] text-gray-400"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {step.step}
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3
                    className={`text-base font-bold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {step.title}
                  </h3>
                  <p
                    className={`text-sm mb-3 leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                  >
                    {step.description}
                  </p>

                  {step.links.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {step.links.map((link, linkIndex) => {
                        if (link.logo) {
                          return (
                            <a
                              key={linkIndex}
                              href={link.url}
                              target={link.external ? "_blank" : undefined}
                              rel={link.external ? "noopener noreferrer" : undefined}
                              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all hover:scale-105 ${
                                isDarkMode
                                  ? "bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/[0.1]"
                                  : "bg-gray-50 border border-gray-200/60 text-gray-900 hover:bg-gray-100"
                              }`}
                            >
                              <img
                                src={link.logo}
                                alt={`${link.label} logo`}
                                className="w-5 h-5"
                              />
                              {link.label}
                            </a>
                          );
                        }
                        return (
                          <Button
                            key={linkIndex}
                            as="a"
                            href={link.url}
                            target={link.external ? "_blank" : undefined}
                            rel={link.external ? "noopener noreferrer" : undefined}
                            variant="primary"
                            size="sm"
                            className="bg-gradient-to-r from-budju-pink to-budju-blue text-white font-bold text-xs px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
                          >
                            {link.label}
                          </Button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Connector line between steps */}
              {index < steps.length - 1 && (
                <div className="flex justify-start ml-6 mt-2">
                  <div
                    className={`w-px h-4 ${isDarkMode ? "bg-white/[0.06]" : "bg-gray-200"}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mt-8"
        >
          <p
            className={`text-xs ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
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
