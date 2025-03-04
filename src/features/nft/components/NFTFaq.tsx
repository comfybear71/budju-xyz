import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { FaChevronDown } from "react-icons/fa";

// FAQ Questions and Answers
const faqItems = [
  {
    question: "When will the BUDJU NFT collection be available?",
    answer:
      "The BUDJU NFT collection will be available for minting once we reach 1,000 BUDJU token holders. You can track our progress in the Minting Countdown section.",
  },
  {
    question: "How many NFTs will be in the collection?",
    answer:
      "The BUDJU NFT collection will consist of 5,000 unique NFTs, each with varying traits and rarity levels ranging from Common to Legendary.",
  },
  {
    question: "What is the mint price?",
    answer:
      "The mint price will be 0.25 SOL per NFT. BUDJU token holders will receive priority access to the mint and may qualify for special discounts based on the number of tokens held.",
  },
  {
    question: "How do I mint a BUDJU NFT?",
    answer:
      "To mint a BUDJU NFT, you'll need a Solana wallet (like Phantom or Jupiter) with enough SOL to cover the mint price and transaction fees. Once the mint is live, connect your wallet on our website and follow the minting instructions.",
  },
  {
    question: "What benefits do BUDJU NFT holders receive?",
    answer:
      "BUDJU NFT holders will receive numerous benefits including exclusive token airdrops, merchandise giveaways, VIP community access, early feature access, shop discounts, and enhanced staking rewards in the Bank of BUDJU. The rarer your NFT, the greater your benefits.",
  },
  {
    question: "Can I sell my BUDJU NFT after minting?",
    answer:
      "Yes, your BUDJU NFT will be tradable on Solana NFT marketplaces such as Magic Eden, Tensor, and Coral Cube after the mint concludes and trading is enabled.",
  },
  {
    question: "Will there be a whitelist for the mint?",
    answer:
      "Yes, BUDJU token holders will automatically be whitelisted for the mint, with priority given to those holding larger amounts. Join our community and hold BUDJU tokens to secure your whitelist spot.",
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

const NFTFaq = () => {
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
            <span className="text-white">FREQUENTLY</span>{" "}
            <span className="text-budju-pink">ASKED QUESTIONS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Everything you need to know about the BUDJU NFT collection
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

        {/* Additional Help */}
        <div className="text-center mt-10">
          <p className="text-gray-300">
            Still have questions? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram
            </a>{" "}
            or{" "}
            <a
              href="https://x.com/budjucoin?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Twitter
            </a>{" "}
            community for support and updates!
          </p>
        </div>
      </div>
    </section>
  );
};

export default NFTFaq;
