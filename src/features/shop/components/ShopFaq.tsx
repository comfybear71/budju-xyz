import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import { FaChevronDown } from "react-icons/fa";

// FAQ Questions and Answers
const faqItems = [
  {
    question: "How can I pay for my order?",
    answer:
      "We accept various payment methods including credit/debit cards, BUDJU tokens, SOL, and other cryptocurrencies via connected wallets. BUDJU token holders receive a 10% discount on all purchases!",
  },
  {
    question: "What are the shipping options and costs?",
    answer:
      "We offer worldwide shipping. Standard shipping is free for orders over $50, otherwise it's $5.99. Express shipping is available for $12.99. Delivery times vary by location but typically range from 5-14 business days for standard shipping.",
  },
  {
    question: "How do I track my order?",
    answer:
      "Once your order ships, you'll receive a confirmation email with tracking information. You can also track your order from your account page if you made the purchase while logged in.",
  },
  {
    question: "What is your return policy?",
    answer:
      "We accept returns within 30 days of delivery for unworn/unused items in original packaging. Return shipping is the responsibility of the customer unless the item was received damaged or incorrect.",
  },
  {
    question: "Do you ship internationally?",
    answer:
      "Yes, we ship to most countries worldwide. International shipping rates and delivery times vary by destination. Any customs fees or import taxes are the responsibility of the recipient.",
  },
  {
    question: "How do I use my BUDJU tokens for purchases?",
    answer:
      "To pay with BUDJU tokens, select the 'Pay with BUDJU / SOL' option at checkout and connect your wallet containing the tokens. The 10% discount will be automatically applied.",
  },
  {
    question: "Do BUDJU NFT holders get special benefits in the shop?",
    answer:
      "Yes! BUDJU NFT holders receive exclusive benefits including special discounts, early access to new merchandise drops, and limited edition items only available to NFT holders. Connect your wallet containing the NFT to access these benefits.",
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

const FaqItem = ({
  question,
  answer,
  isOpen,
  toggleOpen,
  index,
}: FaqItemProps) => {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        className={`flex justify-between items-center w-full py-5 px-4 text-left focus:outline-none ${
          isOpen ? "text-budju-pink" : "text-white"
        }`}
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <h3 className="text-xl font-semibold">{question}</h3>
        <FaChevronDown
          className={`transition-transform duration-300 ${isOpen ? "rotate-180 text-budju-pink" : "text-gray-400"}`}
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

const ShopFaq = () => {
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
            <span className="text-budju-blue">ASKED QUESTIONS</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Everything you need to know about shopping with BUDJU
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

        {/* Customer Support */}
        <div className="text-center mt-10">
          <p className="text-gray-300">
            Need more help? Contact our customer support team at{" "}
            <a
              href="mailto:support@budjucoin.com"
              className="text-budju-blue hover:underline"
            >
              support@budjucoin.com
            </a>
          </p>
        </div>
      </div>
    </section>
  );
};

export default ShopFaq;
