import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { FaChevronDown } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

// FAQ Questions and Answers
const faqItems = [
  {
    question: "What is BUDJU Coin?",
    answer:
      "BUDJU Coin is a community-driven token built on the Solana blockchain. It's more than just a coin—it's a movement, a vibe, a lifestyle that brings together crypto enthusiasts to create a vibrant community experience.",
  },
  {
    question: "How do I store my BUDJU tokens safely?",
    answer:
      "The safest way to store your BUDJU tokens is in a non-custodial wallet like Phantom or Jupiter. Always backup your wallet seed phrase in a secure location offline, and never share it with anyone.",
  },
  {
    question: "What are the fees for buying BUDJU?",
    answer:
      "When swapping SOL for BUDJU, you'll pay a small transaction fee on the Solana network (typically less than $0.01) plus a swap fee that varies by DEX (usually 0.25-0.3%). BUDJU itself does not charge any purchase fees.",
  },
  {
    question: "When will the NFT collection be available?",
    answer:
      "The BUDJU NFT collection will be available once we reach 1,000 wallet holders. This ensures our community is strong enough to support a successful NFT launch. Join our Telegram or Twitter to stay updated on the progress.",
  },
  {
    question: "How does the Bank of BUDJU work?",
    answer:
      "The Bank of BUDJU uses revenue derived from merchandise, staked Solana interest, and NFTs to invest in the development of the BUDJU platform and provide liquidity. It also regularly buys back and burns BUDJU tokens to create scarcity and increase token value.",
  },
  {
    question: "Is there a minimum amount of BUDJU I should buy?",
    answer:
      "There's no minimum requirement to buy BUDJU. You can purchase as little as you want, although Solana's minimum transaction size may effectively create a small minimum. Buy an amount you're comfortable with!",
  },
];

// FAQ Item Component
interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  toggleOpen: () => void;
  index: number;
  isDarkMode: boolean;
}

const FaqItem = ({
  question,
  answer,
  isOpen,
  toggleOpen,
  isDarkMode,
}: FaqItemProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={
        isDarkMode
          ? "border-b border-gray-800 last:border-b-0"
          : "border-b border-white/30 last:border-b-0"
      }
    >
      <button
        className="flex justify-between items-center w-full py-5 px-4 text-left focus:outline-none hover:bg-white/[0.03] transition-colors rounded-lg"
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <h3
          className={`text-xl font-semibold ${isDarkMode ? "text-white" : "text-budju-white"}`}
        >
          {question}
        </h3>
        <FaChevronDown
          className={`text-budju-blue transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
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
            <div
              className={`py-3 px-4 ${isDarkMode ? "text-gray-300" : "text-white"} text-lg`}
            >
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FaqSection = () => {
  const { isDarkMode } = useTheme();
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
    <section ref={sectionRef} className="py-20">
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className={isDarkMode ? "text-white" : "text-budju-white"}>
              FREQUENTLY
            </span>{" "}
            <span className="text-budju-blue">ASKED QUESTIONS</span>
          </h2>
          <p
            className={`text-lg ${isDarkMode ? "text-gray-300" : "text-white"} max-w-3xl mx-auto`}
          >
            Got questions about BUDJU? We've got answers! Here are some of the
            most common questions from our community.
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <div
          className={`max-w-3xl mx-auto ${isDarkMode ? "bg-gray-900/50 border-gray-800" : "bg-white/20 border-white/30"} rounded-xl border overflow-hidden`}
        >
          {faqItems.map((item, index) => (
            <FaqItem
              key={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              toggleOpen={() => toggleOpen(index)}
              index={index}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>

        {/* More Questions */}
        <div className="text-center mt-10">
          <p className={isDarkMode ? "text-gray-300" : "text-white"}>
            Have more questions? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram community
            </a>{" "}
            and ask away!
          </p>
        </div>
      </div>
    </section>
  );
};

export default FaqSection;
