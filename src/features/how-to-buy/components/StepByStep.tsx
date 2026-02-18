import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/context/ThemeContext";
import { REFERRAL_LINKS } from "@constants/addresses";
const swyftxLogo = "/images/how-to-buy/swyftx-logo.png";
const coinbaseLogo = "/images/how-to-buy/coinbase-logo.png";
const coinspotLogo = "/images/how-to-buy/coinspot-logo.png";
const tokocryptoLogo = "/images/how-to-buy/tokocrypto-logo.png";

const tabs = [
  { name: "Swyftx", logo: swyftxLogo },
  { name: "Coinbase", logo: coinbaseLogo },
  { name: "Coinspot", logo: coinspotLogo },
  { name: "Tokocrypto", logo: tokocryptoLogo },
];

const swyftxSteps = {
  toSolana: [
    "🌟 **Sign Up for Swyftx**",
    {
      text: "Go to Swyftx Signup and click 'Sign Up'. You’ll get a bonus when you join!",
      link: (
        <a
          href={REFERRAL_LINKS.SWYFTX}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline"
        >
          Swyftx Signup
        </a>
      ),
    },
    "Fill in your email and create a password. It’s super simple!",
    "✅ **Complete Verification (KYC)**",
    "Swyftx needs to know it’s really you. Give them your email, phone number, and a photo of your ID (like a driver’s license or passport).",
    "Follow the easy steps on the screen to finish this part.",
    "💵 **Deposit AUD (Australian Dollars)**",
    "Go to 'Wallets', then 'Deposit AUD', and pick 'PayID'.",
    "You’ll get a special email address to copy. Open your bank app, paste that email into the PayID section, and send your money. It arrives fast!",
    "🛒 **Turn AUD into SOL (Solana)**",
    "Click 'Trade', then 'Buy', and choose 'SOL' (that’s Solana).",
    "Type in how much AUD you want to spend, check it looks good, and hit confirm!",
    "📤 **Send SOL to Your Wallet**",
    "Open your Phantom wallet app and copy your SOL address (it’s like a bank account number).",
    "Back in Swyftx, go to 'Wallets', then 'Withdraw', and pick 'SOL'. Paste your Phantom address, enter the amount, and send it off!",
  ],
  toBank: [
    "📥 **Send SOL Back to Swyftx**",
    "In your Phantom wallet, click 'Send'.",
    "Find your Swyftx SOL address in 'Wallets' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "💰 **Turn SOL into AUD**",
    "Go to 'Trade', then 'Sell', and pick 'SOL'.",
    "Type in how much SOL to sell, check it, and confirm. Now you have AUD!",
    "🏦 **Withdraw AUD to Your Bank**",
    "Go to 'Wallets', then 'Withdraw AUD'.",
    "Add your bank details (BSB and account number), type the amount, and submit. Your money will be in your bank in 1-2 days!",
  ],
};

const coinbaseSteps = {
  toSolana: [
    "🌟 **Sign Up for Coinbase**",
    {
      text: "Go to Coinbase Signup and click 'Sign Up'. You might get a little welcome bonus!",
      link: (
        <a
          href={REFERRAL_LINKS.COINBASE}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline"
        >
          Coinbase Signup
        </a>
      ),
    },
    "Put in your email and make a password. Easy peasy!",
    "✅ **Complete Verification (KYC)**",
    "Coinbase needs to check who you are. Go to 'Settings' > 'Identity Verification'.",
    "Upload a picture of your ID (like a passport or driver’s license) and follow the steps they show you.",
    "💵 **Deposit USD (US Dollars)**",
    "Coinbase doesn’t use PayID, so we’ll use your bank. Go to 'Assets' > 'Deposit' > 'USD'.",
    "Link your bank account (you might need to add details manually). Send USD from your bank—it takes 1-3 days to arrive.",
    "🛒 **Turn USD into SOL (Solana)**",
    "Click 'Trade', then 'Buy', and pick 'SOL' (Solana).",
    "Type how much USD you want to spend, look it over, and confirm!",
    "📤 **Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Coinbase, go to 'Assets' > 'Solana' > 'Send'. Paste the Phantom address, enter the amount, and hit confirm!",
  ],
  toBank: [
    "📥 **Send SOL Back to Coinbase**",
    "In Phantom, click 'Send'.",
    "Find your Coinbase SOL address in 'Assets' > 'Solana' > 'Deposit', copy it, paste it in Phantom, enter the amount, and confirm.",
    "💰 **Turn SOL into USD**",
    "Go to 'Trade', then 'Sell', and choose 'SOL'.",
    "Type how much SOL to sell, check it, and confirm. Now you have USD!",
    "🏦 **Withdraw USD to Your Bank**",
    "Go to 'Assets' > 'Withdraw' > 'USD'.",
    "Pick your linked bank account, enter the amount, and confirm. Your money arrives in 1-3 days!",
  ],
};

const coinspotSteps = {
  toSolana: [
    "🌟 **Sign Up for Coinspot**",
    {
      text: "Go to Coinspot Signup and click 'Register'. You’ll get a bonus for joining!",
      link: (
        <a
          href={REFERRAL_LINKS.COINSPOT}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline"
        >
          Coinspot Signup
        </a>
      ),
    },
    "Add your email and create a password. It’s really quick!",
    "✅ **Complete Verification (KYC)**",
    "Coinspot needs to know it’s you. Go to 'My Account' > 'Verification'.",
    "Give them your email, phone number, and a photo of your ID (like a driver’s license or passport). Follow the easy steps.",
    "💵 **Deposit AUD (Australian Dollars)**",
    "Go to 'Wallets' > 'Deposit AUD' > 'PayID'.",
    "Copy the special PayID email they give you. Open your bank app, paste it into PayID, and send your money—it’s instant!",
    "🛒 **Turn AUD into SOL (Solana)**",
    "Click 'Buy/Sell', search for 'SOL' (Solana), and pick 'Buy SOL'.",
    "Type how much AUD to spend and confirm. Done!",
    "📤 **Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Coinspot, go to 'Wallets' > 'Withdraw' > 'SOL'. Paste your Phantom address, enter the amount, and confirm!",
  ],
  toBank: [
    "📥 **Send SOL Back to Coinspot**",
    "In Phantom, click 'Send'.",
    "Find your Coinspot SOL address in 'Wallets' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "💰 **Turn SOL into AUD**",
    "Go to 'Buy/Sell', search 'SOL', and pick 'Sell SOL'.",
    "Type how much SOL to sell and confirm. Now you have AUD!",
    "🏦 **Withdraw AUD to Your Bank**",
    "Go to 'Wallets' > 'Withdraw AUD' > 'Bank Transfer'.",
    "Add your bank details (BSB and account number), type the amount, and submit. Money arrives in 1-2 days!",
  ],
};

const tokocryptoSteps = {
  toSolana: [
    "🌟 **Sign Up for Tokocrypto**",
    {
      text: "Go to Tokocrypto Signup and click 'Sign Up'. You might get a bonus!",
      link: (
        <a
          href={REFERRAL_LINKS.TOKOCRYPTO}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline"
        >
          Tokocrypto Signup
        </a>
      ),
    },
    "Enter your email and make a password. It’s very easy!",
    "✅ **Complete Verification (KYC)**",
    "Tokocrypto needs to check it’s you. Go to 'Profile' > 'Verification'.",
    "Upload your KTP (Indonesian ID) or passport, plus your email and phone number. Follow the simple steps.",
    "💵 **Deposit IDR (Indonesian Rupiah)**",
    "Go to 'Wallet' > 'Deposit' > 'IDR'.",
    "Pick a bank (like BCA, Mandiri, or BRI), copy their bank details, and send money from your bank app. It’s usually fast!",
    "🛒 **Turn IDR into SOL (Solana)**",
    "Click 'Trade', search for 'SOL/IDR', and choose 'Buy'.",
    "Type how much IDR to spend, check it, and confirm!",
    "📤 **Send SOL to Your Wallet**",
    "Open your Phantom wallet and copy your SOL address.",
    "In Tokocrypto, go to 'Wallet' > 'Withdraw' > 'SOL'. Paste your Phantom address, enter the amount, and confirm!",
  ],
  toBank: [
    "📥 **Send SOL Back to Tokocrypto**",
    "In Phantom, click 'Send'.",
    "Find your Tokocrypto SOL address in 'Wallet' > 'Deposit' > 'SOL', copy it, paste it in Phantom, enter the amount, and confirm.",
    "💰 **Turn SOL into IDR**",
    "Go to 'Trade', search 'SOL/IDR', and pick 'Sell'.",
    "Type how much SOL to sell, check it, and confirm. Now you have IDR!",
    "🏦 **Withdraw IDR to Your Bank**",
    "Go to 'Wallet' > 'Withdraw' > 'IDR'.",
    "Add your bank details (like BCA or Mandiri), type the amount, and submit. Money arrives in 1-2 days!",
  ],
};

const StepByStep = () => {
  const { isDarkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(tabs[0].name);

  return (
    <section className="py-20">
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
            How to Buy SOL and Cash Out
          </h2>
          <p
            className={`text-lg ${
              isDarkMode ? "text-gray-300" : "text-white"
            } max-w-3xl mx-auto`}
          >
            Follow these steps to set up a centralized exchange account, deposit fiat via PayID or bank transfer, convert to SOL, send to a Solana wallet, and reverse the process to cash out.
          </p>
        </motion.div>

        {/* Tabbed Interface */}
        <div className="max-w-4xl mx-auto">
          {/* Tab Headers */}
          <div className="flex flex-col md:flex-row">
            {tabs.map((tab, index) => (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                className={`flex-1 py-3 px-4 text-lg font-semibold transition-all duration-300 ${
                  activeTab === tab.name
                    ? `${
                        index === 0
                          ? "bg-blue-600"
                          : index === 1
                          ? "bg-purple-600"
                          : index === 2
                          ? "bg-pink-600"
                          : "bg-green-600"
                      } text-white`
                    : `bg-gray-700 text-gray-300 hover:bg-gray-600`
                } ${
                  index === 0
                    ? "rounded-tl-lg md:rounded-tr-none"
                    : index === tabs.length - 1
                    ? "rounded-b-lg md:rounded-tr-lg"
                    : "md:rounded-none"
                } flex items-center justify-center`}
              >
                <img
                  src={tab.logo}
                  alt={`${tab.name} logo`}
                  className="w-6 h-6 mr-2"
                />
                {tab.name}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div
            className={`p-6 rounded-b-lg ${
              isDarkMode ? "bg-gray-100 text-gray-900" : "bg-white text-gray-900"
            } border-t-0 shadow-md`}
          >
            <AnimatePresence mode="wait">
              {activeTab === "Swyftx" && (
                <motion.div
                  key="swyftx"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Swyftx: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {swyftxSteps.toSolana.map((step, index) =>
                      typeof step === "string" ? (
                        <li key={index}>{step}</li>
                      ) : (
                        <li key={index}>
                          {step.text.replace("Swyftx Signup", "")} {step.link}
                        </li>
                      )
                    )}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Swyftx: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {swyftxSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {activeTab === "Coinbase" && (
                <motion.div
                  key="coinbase"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Coinbase: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {coinbaseSteps.toSolana.map((step, index) =>
                      typeof step === "string" ? (
                        <li key={index}>{step}</li>
                      ) : (
                        <li key={index}>
                          {step.text.replace("Coinbase Signup", "")}{" "}
                          {step.link}
                        </li>
                      )
                    )}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Coinbase: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {coinbaseSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {activeTab === "Coinspot" && (
                <motion.div
                  key="coinspot"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Coinspot: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {coinspotSteps.toSolana.map((step, index) =>
                      typeof step === "string" ? (
                        <li key={index}>{step}</li>
                      ) : (
                        <li key={index}>
                          {step.text.replace("Coinspot Signup", "")}{" "}
                          {step.link}
                        </li>
                      )
                    )}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Coinspot: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {coinspotSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
              {activeTab === "Tokocrypto" && (
                <motion.div
                  key="tokocrypto"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <h3 className="text-2xl font-bold mb-4">
                    Tokocrypto: From Fiat to Solana Wallet
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {tokocryptoSteps.toSolana.map((step, index) =>
                      typeof step === "string" ? (
                        <li key={index}>{step}</li>
                      ) : (
                        <li key={index}>
                          {step.text.replace("Tokocrypto Signup", "")}{" "}
                          {step.link}
                        </li>
                      )
                    )}
                  </ul>
                  <h3 className="text-2xl font-bold mt-8 mb-4">
                    Tokocrypto: From Solana Wallet to Bank
                  </h3>
                  <ul className="list-none pl-6 space-y-2">
                    {tokocryptoSteps.toBank.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p
            className={
              isDarkMode
                ? "text-gray-400 mt-4 text-lg"
                : "text-white/80 mt-4 text-lg"
            }
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