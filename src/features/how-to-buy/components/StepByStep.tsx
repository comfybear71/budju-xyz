import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTheme } from "@/context/ThemeContext";
import { REFERRAL_LINKS } from "@constants/addresses";
import { FaArrowRight, FaArrowLeft, FaUniversity, FaExchangeAlt } from "react-icons/fa";

const swyftxLogo = "/images/how-to-buy/swyftx-logo.png";
const coinbaseLogo = "/images/how-to-buy/coinbase-logo.png";
const coinspotLogo = "/images/how-to-buy/coinspot-logo.png";
const tokocryptoLogo = "/images/how-to-buy/tokocrypto-logo.png";

const tabs = [
  { name: "Swyftx", logo: swyftxLogo, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", activeBg: "bg-blue-500/20" },
  { name: "Coinbase", logo: coinbaseLogo, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/20", activeBg: "bg-purple-500/20" },
  { name: "Coinspot", logo: coinspotLogo, color: "text-pink-400", bg: "bg-pink-500/10", border: "border-pink-500/20", activeBg: "bg-pink-500/20" },
  { name: "Tokocrypto", logo: tokocryptoLogo, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20", activeBg: "bg-green-500/20" },
];

interface StepItem {
  heading?: boolean;
  text: string;
  link?: { label: string; url: string };
}

const parseSteps = (
  rawSteps: (string | { text: string; link: { label: string; url: string } })[],
): StepItem[] => {
  return rawSteps.map((s) => {
    if (typeof s === "string") {
      const isHeading = s.startsWith("**") || /^\*\*/.test(s);
      return { heading: isHeading, text: s.replace(/\*\*/g, "") };
    }
    return { text: s.text, link: { label: s.link.label, url: s.link.url } };
  });
};

const swyftxSteps = {
  toSolana: parseSteps([
    "**Sign Up for Swyftx**",
    { text: "Go to Swyftx and click 'Sign Up'. You'll get a bonus when you join!", link: { label: "Swyftx Signup", url: REFERRAL_LINKS.SWYFTX } },
    "Fill in your email and create a password.",
    "**Complete Verification (KYC)**",
    "Swyftx needs to know it's really you. Give them your email, phone number, and a photo of your ID.",
    "Follow the easy steps on the screen to finish this part.",
    "**Deposit AUD**",
    "Go to 'Wallets', then 'Deposit AUD', and pick 'PayID'.",
    "You'll get a special email address to copy. Open your bank app, paste that email into the PayID section, and send your money.",
    "**Turn AUD into SOL**",
    "Click 'Trade', then 'Buy', and choose 'SOL' (Solana).",
    "Type in how much AUD you want to spend, check it looks good, and hit confirm!",
    "**Send SOL to Your Wallet**",
    "Open your Phantom wallet app and copy your SOL address.",
    "Back in Swyftx, go to 'Wallets', then 'Withdraw', and pick 'SOL'. Paste your Phantom address, enter the amount, and send it off!",
  ]),
  toBank: parseSteps([
    "**Send SOL Back to Swyftx**",
    "In your Phantom wallet, click 'Send'.",
    "Find your Swyftx SOL address in 'Wallets' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "**Turn SOL into AUD**",
    "Go to 'Trade', then 'Sell', and pick 'SOL'.",
    "Type in how much SOL to sell, check it, and confirm. Now you have AUD!",
    "**Withdraw AUD to Your Bank**",
    "Go to 'Wallets', then 'Withdraw AUD'.",
    "Add your bank details (BSB and account number), type the amount, and submit. Your money will be in your bank in 1-2 days!",
  ]),
};

const coinbaseSteps = {
  toSolana: parseSteps([
    "**Sign Up for Coinbase**",
    { text: "Go to Coinbase and click 'Sign Up'. You might get a welcome bonus!", link: { label: "Coinbase Signup", url: REFERRAL_LINKS.COINBASE } },
    "Put in your email and make a password.",
    "**Complete Verification (KYC)**",
    "Coinbase needs to check who you are. Go to 'Settings' > 'Identity Verification'.",
    "Upload a picture of your ID and follow the steps they show you.",
    "**Deposit USD**",
    "Go to 'Assets' > 'Deposit' > 'USD'.",
    "Link your bank account. Send USD from your bank — it takes 1-3 days to arrive.",
    "**Turn USD into SOL**",
    "Click 'Trade', then 'Buy', and pick 'SOL' (Solana).",
    "Type how much USD you want to spend, look it over, and confirm!",
    "**Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Coinbase, go to 'Assets' > 'Solana' > 'Send'. Paste the Phantom address, enter the amount, and hit confirm!",
  ]),
  toBank: parseSteps([
    "**Send SOL Back to Coinbase**",
    "In Phantom, click 'Send'.",
    "Find your Coinbase SOL address in 'Assets' > 'Solana' > 'Deposit', copy it, paste it in Phantom, enter the amount, and confirm.",
    "**Turn SOL into USD**",
    "Go to 'Trade', then 'Sell', and choose 'SOL'.",
    "Type how much SOL to sell, check it, and confirm. Now you have USD!",
    "**Withdraw USD to Your Bank**",
    "Go to 'Assets' > 'Withdraw' > 'USD'.",
    "Pick your linked bank account, enter the amount, and confirm. Your money arrives in 1-3 days!",
  ]),
};

const coinspotSteps = {
  toSolana: parseSteps([
    "**Sign Up for Coinspot**",
    { text: "Go to Coinspot and click 'Register'. You'll get a bonus for joining!", link: { label: "Coinspot Signup", url: REFERRAL_LINKS.COINSPOT } },
    "Add your email and create a password.",
    "**Complete Verification (KYC)**",
    "Coinspot needs to know it's you. Go to 'My Account' > 'Verification'.",
    "Give them your email, phone number, and a photo of your ID. Follow the easy steps.",
    "**Deposit AUD**",
    "Go to 'Wallets' > 'Deposit AUD' > 'PayID'.",
    "Copy the special PayID email they give you. Open your bank app, paste it into PayID, and send your money — it's instant!",
    "**Turn AUD into SOL**",
    "Click 'Buy/Sell', search for 'SOL' (Solana), and pick 'Buy SOL'.",
    "Type how much AUD to spend and confirm. Done!",
    "**Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Coinspot, go to 'Wallets' > 'Withdraw' > 'SOL'. Paste your Phantom address, enter the amount, and confirm!",
  ]),
  toBank: parseSteps([
    "**Send SOL Back to Coinspot**",
    "In Phantom, click 'Send'.",
    "Find your Coinspot SOL address in 'Wallets' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "**Turn SOL into AUD**",
    "Go to 'Buy/Sell', search 'SOL', and pick 'Sell SOL'.",
    "Type how much SOL to sell and confirm. Now you have AUD!",
    "**Withdraw AUD to Your Bank**",
    "Go to 'Wallets' > 'Withdraw AUD' > 'Bank Transfer'.",
    "Add your bank details (BSB and account number), type the amount, and submit. Money arrives in 1-2 days!",
  ]),
};

const tokocryptoSteps = {
  toSolana: parseSteps([
    "**Sign Up for Tokocrypto**",
    { text: "Go to Tokocrypto and click 'Sign Up'. You might get a bonus!", link: { label: "Tokocrypto Signup", url: REFERRAL_LINKS.TOKOCRYPTO } },
    "Enter your email and make a password.",
    "**Complete Verification (KYC)**",
    "Tokocrypto needs to check it's you. Go to 'Profile' > 'Verification'.",
    "Upload your KTP (Indonesian ID) or passport, plus your email and phone number. Follow the simple steps.",
    "**Deposit IDR**",
    "Go to 'Wallet' > 'Deposit' > 'IDR'.",
    "Pick a bank (like BCA, Mandiri, or BRI), copy their bank details, and send money from your bank app.",
    "**Turn IDR into SOL**",
    "Click 'Trade', search for 'SOL/IDR', and choose 'Buy'.",
    "Type how much IDR to spend, check it, and confirm!",
    "**Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Tokocrypto, go to 'Wallet' > 'Withdraw' > 'SOL'. Paste your Phantom address, enter the amount, and confirm!",
  ]),
  toBank: parseSteps([
    "**Send SOL Back to Tokocrypto**",
    "In Phantom, click 'Send'.",
    "Find your Tokocrypto SOL address in 'Wallet' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "**Turn SOL into IDR**",
    "Go to 'Trade', search 'SOL/IDR', and pick 'Sell'.",
    "Type how much SOL to sell, check it, and confirm. Now you have IDR!",
    "**Withdraw IDR to Your Bank**",
    "Go to 'Wallet' > 'Withdraw' > 'IDR'.",
    "Add your bank details (like BCA or Mandiri), type the amount, and submit. Money arrives in 1-2 days!",
  ]),
};

const exchangeData: Record<string, { toSolana: StepItem[]; toBank: StepItem[] }> = {
  Swyftx: swyftxSteps,
  Coinbase: coinbaseSteps,
  Coinspot: coinspotSteps,
  Tokocrypto: tokocryptoSteps,
};

const StepList = ({ items, isDarkMode }: { items: StepItem[]; isDarkMode: boolean }) => (
  <div className="space-y-2">
    {items.map((item, i) => {
      if (item.heading) {
        return (
          <h4
            key={i}
            className={`text-sm font-bold pt-3 first:pt-0 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {item.text}
          </h4>
        );
      }
      return (
        <div
          key={i}
          className={`flex items-start gap-2 text-xs leading-relaxed ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
        >
          <span
            className={`w-1 h-1 rounded-full mt-1.5 flex-shrink-0 ${isDarkMode ? "bg-white/20" : "bg-gray-300"}`}
          />
          <span>
            {item.text}
            {item.link && (
              <>
                {" "}
                <a
                  href={item.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-budju-blue hover:underline font-medium"
                >
                  {item.link.label}
                </a>
              </>
            )}
          </span>
        </div>
      );
    })}
  </div>
);

const StepByStep = () => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(tabs[0].name);
  const [direction, setDirection] = useState<"toSolana" | "toBank">("toSolana");

  const data = exchangeData[activeTab];

  return (
    <section className="py-16 px-4">
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
            Exchange{" "}
            <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
              Guides
            </span>
          </h2>
          <p
            className={`text-sm max-w-lg mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            Step-by-step guides for buying SOL and cashing out through popular exchanges.
          </p>
        </motion.div>

        <div className="max-w-3xl mx-auto">
          {/* Exchange Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.name;
              return (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    isActive
                      ? isDarkMode
                        ? `${tab.activeBg} ${tab.border} border ${tab.color}`
                        : `bg-gray-900 text-white border border-gray-800`
                      : isDarkMode
                        ? `bg-white/[0.03] border border-white/[0.06] text-gray-500 hover:bg-white/[0.06]`
                        : `bg-gray-50 border border-gray-200/60 text-gray-500 hover:bg-gray-100`
                  }`}
                >
                  <img src={tab.logo} alt={tab.name} className="w-4 h-4" />
                  {tab.name}
                </button>
              );
            })}
          </div>

          {/* Direction Toggle */}
          <div
            className={`flex rounded-xl p-1 mb-4 ${
              isDarkMode
                ? "bg-white/[0.03] border border-white/[0.06]"
                : "bg-gray-50 border border-gray-200/60"
            }`}
          >
            <button
              onClick={() => setDirection("toSolana")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                direction === "toSolana"
                  ? isDarkMode
                    ? "bg-green-500/15 text-green-400 border border-green-500/20"
                    : "bg-green-50 text-green-700 border border-green-200"
                  : isDarkMode
                    ? "text-gray-500 hover:text-gray-400"
                    : "text-gray-500 hover:text-gray-600"
              }`}
            >
              <FaArrowRight size={10} />
              Fiat to Wallet
            </button>
            <button
              onClick={() => setDirection("toBank")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                direction === "toBank"
                  ? isDarkMode
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                  : isDarkMode
                    ? "text-gray-500 hover:text-gray-400"
                    : "text-gray-500 hover:text-gray-600"
              }`}
            >
              <FaArrowLeft size={10} />
              Wallet to Bank
            </button>
          </div>

          {/* Content Card */}
          <div
            className={`rounded-xl border p-5 ${
              isDarkMode
                ? "bg-[#0c0c20]/60 border-white/[0.06]"
                : "bg-white/60 border-gray-200/40"
            } backdrop-blur-sm`}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-white/[0.06]">
              <img
                src={tabs.find((t) => t.name === activeTab)?.logo}
                alt={activeTab}
                className="w-6 h-6"
              />
              <div>
                <h3
                  className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {activeTab}:{" "}
                  {direction === "toSolana"
                    ? "From Fiat to Solana Wallet"
                    : "From Solana Wallet to Bank"}
                </h3>
                <p
                  className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  {direction === "toSolana" ? (
                    <span className="inline-flex items-center gap-1">
                      <FaExchangeAlt size={8} /> Buy SOL and send to your wallet
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <FaUniversity size={8} /> Sell SOL and withdraw to your bank
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Steps */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${direction}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <StepList items={data[direction]} isDarkMode={isDarkMode} />
              </motion.div>
            </AnimatePresence>
          </div>
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
            Need help? Join our{" "}
            <a
              href="http://t.me/budjucoingroup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-budju-blue hover:underline"
            >
              Telegram
            </a>{" "}
            for support!
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default StepByStep;
