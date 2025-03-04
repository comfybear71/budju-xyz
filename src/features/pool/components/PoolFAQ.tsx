import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { FaChevronDown } from "react-icons/fa";

// FAQ Questions and Answers
const faqItems = [
  {
    question: "What are liquidity pools and why are they important for BUDJU?",
    answer:
      "Liquidity pools are smart contracts that hold pairs of tokens to enable decentralized trading. They're essential for BUDJU because they provide the infrastructure for users to buy and sell tokens without relying on centralized exchanges. By contributing to BUDJU pools, you help create a more liquid, stable, and accessible market for the token.",
  },
  {
    question: "How much can I earn by providing liquidity to BUDJU pools?",
    answer:
      "Earnings vary based on factors like the amount of liquidity provided, your price range, pool trading volume, and market conditions. Currently, BUDJU pools offer estimated APRs between 10-30%, with higher returns for concentrated positions in active price ranges. Remember that returns are not guaranteed and can fluctuate significantly.",
  },
  {
    question:
      "What is impermanent loss and how does it affect BUDJU liquidity providers?",
    answer:
      "Impermanent loss occurs when the price ratio of your deposited tokens changes compared to when you added them to the pool. If BUDJU's price changes significantly relative to SOL or USDC after you provide liquidity, you might receive back a different ratio of tokens worth less than if you had simply held them. Concentrated liquidity can magnify this effect, but it's partially offset by trading fees earned.",
  },
  {
    question: "Which BUDJU pool should I provide liquidity to?",
    answer:
      "Both SOL-BUDJU and USDC-BUDJU pools have advantages. The SOL-BUDJU pool often has higher trading volume and might offer better APRs but can experience more price volatility. The USDC-BUDJU pool provides more stability since USDC is a stablecoin. Your choice should depend on your risk tolerance and which token (SOL or USDC) you're more comfortable holding alongside BUDJU.",
  },
  {
    question: "How often should I rebalance my BUDJU pool position?",
    answer:
      "There's no one-size-fits-all answer, but successful BUDJU liquidity providers typically monitor their positions daily and rebalance when: (1) prices move outside their range, (2) they notice a significant shift in BUDJU's price trend, or (3) they want to adjust their strategy based on new market information. Balance the benefits of active range positioning against the transaction costs of frequent rebalancing.",
  },
  {
    question: "Can I lose money by providing liquidity to BUDJU pools?",
    answer:
      "Yes, liquidity providing carries risks. You may experience impermanent loss if token prices change significantly. Additionally, if BUDJU's value decreases substantially while you're providing liquidity, the overall value of your position will decrease as well. However, trading fees can offset some of these risks, especially in high-volume pools.",
  },
  {
    question:
      "What happens to my position if BUDJU's price moves out of my selected range?",
    answer:
      "When the price moves outside your range, your position becomes 100% composed of one token (BUDJU if price falls below range, or SOL/USDC if price rises above range) and stops generating fees. Your liquidity remains safely in the pool but is inactive until prices return to your range or you rebalance your position.",
  },
  {
    question: "How do I track my earnings from BUDJU liquidity pools?",
    answer:
      "Raydium's interface shows accumulated fees in your positions dashboard. You can view your active positions, their current status (in range or not), and any uncollected fees. Several third-party portfolio trackers also support tracking Raydium positions, showing historical performance and detailed analytics about your BUDJU liquidity providing activity.",
  },
];

// FAQ Item Component
interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  toggleOpen: () => void;
  index: number;
}

const FaqItem = ({ question, answer, isOpen, toggleOpen }: FaqItemProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        className={`flex justify-between items-center w-full py-5 px-4 text-left focus:outline-none ${
          isOpen ? "text-budju-blue" : "text-white"
        }`}
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <h3 className="text-xl font-semibold">{question}</h3>
        <FaChevronDown
          className={`transition-transform duration-300 ${isOpen ? "rotate-180 text-budju-blue" : "text-gray-400"}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            ref={contentRef}
            className="overflow-hidden"
          >
            <div className="py-3 px-4 text-gray-300 text-lg">{answer}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const PoolFAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  const toggleOpen = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  useEffect(() => {
    if (sectionRef.current) {
      // Animate section entry
      gsap.fromTo(
        sectionRef.current,
        {
          opacity: 0,
          y: 30,
        },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          scrollTrigger: {
            trigger: sectionRef.current,
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
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">FREQUENTLY</span>{" "}
            <span className="text-budju-blue">ASKED QUESTIONS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Common questions about BUDJU liquidity pools
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <div className="max-w-3xl mx-auto bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
          {faqItems.map((item, index) => (
            <FaqItem
              key={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              toggleOpen={() => toggleOpen(index)}
              index={index}
            />
          ))}
        </div>

        {/* More Questions */}
        <div className="text-center mt-10">
          <p className="text-gray-300">
            Still have questions about BUDJU pools? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram community
            </a>{" "}
            for personalized assistance.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PoolFAQ;
