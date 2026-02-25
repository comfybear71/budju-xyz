import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { FaChevronDown } from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";

const faqItems = [
  {
    question: "How do I buy a BUDJU NFT?",
    answer:
      "Connect your Solana wallet (Phantom, Solflare, or Jupiter) on this page. Browse the collection, pick an NFT you like, choose your payment currency (BUDJU, USDC, or SOL), and confirm the transaction in your wallet. The NFT will appear in your wallet within seconds.",
  },
  {
    question: "What currencies can I pay with?",
    answer:
      "You can pay with BUDJU tokens, USDC, or SOL. All payments go directly to the Bank of BUDJU treasury wallet, which you can verify on-chain via Solscan.",
  },
  {
    question: "How many NFTs are in the collection?",
    answer:
      "The BUDJU NFT collection features 30 unique hand-crafted NFTs across 6 rarity tiers: Common (10), Uncommon (8), Rare (5), Epic (4), Legendary (2), and the ultra-rare Golden (1 of 1).",
  },
  {
    question: "What is the Golden NFT?",
    answer:
      "The Golden NFT is the rarest piece in the entire collection — only one exists. It comes with maximum-tier perks: 10x airdrop multiplier, exclusive one-of-a-kind merchandise box, lifetime VIP access to all BUDJU events, and permanent crown status in the community.",
  },
  {
    question: "What benefits do NFT holders get?",
    answer:
      "Every BUDJU NFT holder receives token airdrops, VIP community access, merchandise giveaways, early access to new features, shop discounts, and enhanced staking rewards in the Bank of BUDJU. Higher rarity NFTs receive larger airdrops and additional exclusive perks.",
  },
  {
    question: "Will my NFT show up in my wallet?",
    answer:
      "Yes! BUDJU NFTs are minted on the Solana blockchain using the Metaplex standard. They will appear in any Solana-compatible wallet (Phantom, Solflare, etc.) and on marketplaces like Magic Eden and Tensor.",
  },
  {
    question: "Can I resell my BUDJU NFT?",
    answer:
      "Absolutely. Once you own a BUDJU NFT, you can list it on any Solana NFT marketplace including Magic Eden, Tensor, or trade it peer-to-peer. You can also list it on our built-in marketplace.",
  },
  {
    question: "Where do the proceeds go?",
    answer:
      "100% of NFT sale proceeds go to the Bank of BUDJU treasury. This funds community development, events, airdrops, and ecosystem growth. The treasury address is public and verifiable on Solscan.",
  },
];

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  toggleOpen: () => void;
  isDarkMode: boolean;
}

const FaqItem = ({
  question,
  answer,
  isOpen,
  toggleOpen,
  isDarkMode,
}: FaqItemProps) => {
  return (
    <div
      className={
        isDarkMode
          ? "border-b border-white/[0.06] last:border-b-0"
          : "border-b border-gray-100 last:border-b-0"
      }
    >
      <button
        className={`flex justify-between items-center w-full py-4 px-4 text-left focus:outline-none transition-colors ${
          isOpen
            ? "text-budju-pink"
            : isDarkMode
              ? "text-white hover:text-gray-300"
              : "text-gray-900 hover:text-gray-600"
        }`}
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <h3 className="text-sm font-bold pr-4">{question}</h3>
        <FaChevronDown
          size={12}
          className={`flex-shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-budju-pink" : isDarkMode ? "text-gray-600" : "text-gray-400"}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className={`pb-4 px-4 text-sm leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const NFTFaq = () => {
  const { isDarkMode } = useTheme();
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const sectionRef = useRef<HTMLDivElement>(null);

  const toggleOpen = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  useEffect(() => {
    if (sectionRef.current) {
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
          },
        },
      );
    }
  }, []);

  return (
    <section ref={sectionRef} className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-8"
        >
          <h2
            className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            Frequently{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Asked Questions
            </span>
          </h2>
          <p
            className={`text-sm ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Everything you need to know about the BUDJU NFT Marketplace
          </p>
        </motion.div>

        <div
          className={`rounded-xl border overflow-hidden ${isDarkMode ? "bg-[#0c0c20]/60 border-white/[0.06]" : "bg-white/60 border-gray-200/40"} backdrop-blur-sm`}
        >
          {faqItems.map((item, index) => (
            <FaqItem
              key={index}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === index}
              toggleOpen={() => toggleOpen(index)}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>

        <div className="text-center mt-8">
          <p
            className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
          >
            Still have questions? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline font-medium"
            >
              Telegram
            </a>{" "}
            or{" "}
            <a
              href="https://x.com/budjucoin?s=21"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline font-medium"
            >
              Twitter
            </a>{" "}
            community.
          </p>
        </div>
      </div>
    </section>
  );
};

export default NFTFaq;
