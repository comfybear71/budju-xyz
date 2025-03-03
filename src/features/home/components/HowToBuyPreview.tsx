import { useRef, useEffect } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import Button from "@components/common/Button";
import { ROUTES } from "@constants/routes";

// Step icons
import {
  FaWallet,
  FaDollarSign,
  FaExchangeAlt,
  FaCheckCircle,
} from "react-icons/fa";

const steps = [
  {
    icon: FaWallet,
    title: "Create a wallet",
    description: "Download Phantom or Jupiter and set up your wallet",
    color: "bg-blue-600",
  },
  {
    icon: FaDollarSign,
    title: "Get some SOL",
    description: "Purchase SOL from an exchange or within the app",
    color: "bg-purple-600",
  },
  {
    icon: FaExchangeAlt,
    title: "Swap for BUDJU",
    description: "Use the built-in swap feature to get BUDJU tokens",
    color: "bg-pink-600",
  },
  {
    icon: FaCheckCircle,
    title: "You are a holder!",
    description: `Congratulations! You're now part of the BUDJU community`,
    color: "bg-green-600",
  },
];

const HowToBuyPreview = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sectionRef.current && stepsRef.current) {
      // Animate steps on scroll
      gsap.fromTo(
        stepsRef.current.children,
        {
          y: 50,
          opacity: 0,
        },
        {
          y: 0,
          opacity: 1,
          stagger: 0.2,
          duration: 0.8,
          ease: "power2.out",
          scrollTrigger: {
            trigger: stepsRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold">
            <span className="text-white">HOW</span>{" "}
            <span className="text-budju-blue">TO BUY BUDJU</span>
          </h2>
          <p className="text-xl text-gray-300 mt-4 max-w-3xl mx-auto">
            Follow these simple steps to join the BUDJU community and start your
            journey to the moon!
          </p>
        </motion.div>

        {/* Steps */}
        <div
          ref={stepsRef}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
        >
          {steps.map((step, index) => (
            <div
              key={index}
              className="budju-card hover:border-budju-blue transition-all duration-500"
            >
              <div className="flex flex-col items-center text-center p-6">
                <div
                  className={`${step.color} w-16 h-16 rounded-full flex items-center justify-center mb-4`}
                >
                  <step.icon size={32} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-400">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center"
        >
          <Button as="link" to={ROUTES.HOW_TO_BUY} size="lg">
            Detailed Buying Guide
          </Button>
          <p className="text-gray-400 mt-4">
            Need help? Join our{" "}
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

export default HowToBuyPreview;
