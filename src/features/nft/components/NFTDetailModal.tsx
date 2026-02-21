import { useState } from "react";
import { motion } from "motion/react";
import {
  FaTimes,
  FaHeart,
  FaRegHeart,
  FaStar,
  FaRegStar,
  FaExternalLinkAlt,
  FaWallet,
  FaCheckCircle,
  FaShareAlt,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import { RARITY_CONFIG, type BudjuNFT } from "../data/nftCollection";
import { BANK_ADDRESS, TOKEN_ADDRESS } from "@/constants/addresses";

type PaymentCurrency = "BUDJU" | "USDC" | "SOL";

interface Props {
  nft: BudjuNFT;
  onClose: () => void;
  liked: boolean;
  onLike: (e: React.MouseEvent) => void;
}

const CURRENCY_INFO: Record<
  PaymentCurrency,
  { label: string; icon: string; color: string }
> = {
  BUDJU: {
    label: "BUDJU",
    icon: "/images/tokens/budju.png",
    color: "from-budju-pink to-budju-blue",
  },
  USDC: {
    label: "USDC",
    icon: "/images/tokens/usdc.png",
    color: "from-blue-400 to-blue-600",
  },
  SOL: {
    label: "SOL",
    icon: "/images/tokens/sol.png",
    color: "from-purple-400 to-purple-600",
  },
};

const NFTDetailModal = ({ nft, onClose, liked, onLike }: Props) => {
  const { isDarkMode } = useTheme();
  const cfg = RARITY_CONFIG[nft.rarity];
  const isGolden = nft.rarity === "Golden";

  const [selectedCurrency, setSelectedCurrency] =
    useState<PaymentCurrency>("USDC");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [purchaseStep, setPurchaseStep] = useState<
    "browse" | "confirm" | "processing" | "success"
  >("browse");
  const [copied, setCopied] = useState(false);

  const handleBuyClick = () => setPurchaseStep("confirm");

  const handleConfirmPurchase = () => {
    setPurchaseStep("processing");
    // Simulate processing — in production, this triggers an actual Solana transaction
    setTimeout(() => setPurchaseStep("success"), 2500);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/nft?id=${nft.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border ${
          isDarkMode
            ? `bg-[#0a0a1a] ${isGolden ? "border-yellow-400/40 shadow-2xl shadow-yellow-400/10" : "border-white/[0.08]"}`
            : `bg-white ${isGolden ? "border-yellow-400/60 shadow-2xl shadow-yellow-400/20" : "border-gray-200"}`
        }`}
      >
        {/* Golden glow */}
        {isGolden && (
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 via-transparent to-amber-600/5 rounded-2xl pointer-events-none" />
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 z-10 p-2 rounded-full transition-colors ${isDarkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}
        >
          <FaTimes size={16} />
        </button>

        <div className="flex flex-col md:flex-row">
          {/* ── Left: Image ─────────────────────────────── */}
          <div className="md:w-1/2 relative">
            <div className="aspect-square overflow-hidden rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none">
              <img
                src={nft.image}
                alt={nft.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Rarity badge on image */}
            <div
              className={`absolute top-4 left-4 px-3 py-1 rounded-full text-xs font-bold border backdrop-blur-sm ${cfg.bg} ${cfg.color} ${cfg.border}`}
            >
              {nft.rarity}
            </div>
          </div>

          {/* ── Right: Details ──────────────────────────── */}
          <div className="md:w-1/2 p-6">
            {/* Title & actions */}
            <div className="flex items-start justify-between mb-1">
              <div className="flex-1 min-w-0 pr-8">
                <h2
                  className={`text-xl font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {nft.name}
                </h2>
              </div>
            </div>

            {/* Edition & share */}
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`text-xs font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                {nft.edition}
              </span>
              <button
                onClick={onLike}
                className="flex items-center gap-1 text-xs"
              >
                {liked ? (
                  <FaHeart className="text-budju-pink" size={12} />
                ) : (
                  <FaRegHeart
                    className={isDarkMode ? "text-gray-500" : "text-gray-400"}
                    size={12}
                  />
                )}
                <span
                  className={isDarkMode ? "text-gray-500" : "text-gray-400"}
                >
                  {liked ? "Liked" : "Like"}
                </span>
              </button>
              <button
                onClick={handleShare}
                className={`flex items-center gap-1 text-xs ${isDarkMode ? "text-gray-500 hover:text-white" : "text-gray-400 hover:text-gray-700"} transition-colors`}
              >
                <FaShareAlt size={10} />
                {copied ? "Copied!" : "Share"}
              </button>
            </div>

            {/* Description */}
            <p
              className={`text-sm leading-relaxed mb-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
            >
              {nft.description}
            </p>

            {/* Traits */}
            <div className="mb-5">
              <h3
                className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                Traits
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {nft.traits.map((trait) => (
                  <div
                    key={trait.category}
                    className={`p-2 rounded-lg border ${isDarkMode ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}
                  >
                    <div
                      className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                    >
                      {trait.category}
                    </div>
                    <div
                      className={`text-xs font-medium ${isDarkMode ? "text-white" : "text-gray-800"}`}
                    >
                      {trait.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rating */}
            <div className="mb-5">
              <h3
                className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
              >
                Rate this NFT
              </h3>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="transition-transform hover:scale-110"
                  >
                    {star <= (hoverRating || rating) ? (
                      <FaStar className="text-amber-400" size={20} />
                    ) : (
                      <FaRegStar
                        className={
                          isDarkMode ? "text-gray-600" : "text-gray-300"
                        }
                        size={20}
                      />
                    )}
                  </button>
                ))}
                {rating > 0 && (
                  <span
                    className={`text-xs ml-2 self-center ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {rating}/5
                  </span>
                )}
              </div>
            </div>

            {/* ── Purchase Section ────────────────────── */}
            {purchaseStep === "browse" && (
              <div>
                {/* Price */}
                <div
                  className={`flex items-center justify-between p-3 rounded-lg border mb-3 ${isDarkMode ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}
                >
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    Price
                  </span>
                  <span
                    className={`text-xl font-bold ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}
                  >
                    ${nft.price.toLocaleString()}
                  </span>
                </div>

                {/* Currency selector */}
                <div className="mb-4">
                  <div
                    className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    Pay with
                  </div>
                  <div className="flex gap-2">
                    {(
                      Object.keys(CURRENCY_INFO) as PaymentCurrency[]
                    ).map((cur) => (
                      <button
                        key={cur}
                        onClick={() => setSelectedCurrency(cur)}
                        className={`flex-1 flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-bold transition-all ${
                          selectedCurrency === cur
                            ? `bg-gradient-to-r ${CURRENCY_INFO[cur].color} text-white border-transparent`
                            : isDarkMode
                              ? "bg-white/[0.04] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/[0.15]"
                              : "bg-gray-50 border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <img
                          src={CURRENCY_INFO[cur].icon}
                          alt={cur}
                          className="w-5 h-5 rounded-full"
                        />
                        {cur}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buy button */}
                <button
                  onClick={handleBuyClick}
                  className={`w-full py-3 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 ${
                    isGolden
                      ? "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600"
                      : "bg-gradient-to-r from-budju-pink to-budju-blue"
                  }`}
                >
                  <FaWallet className="inline mr-2" size={14} />
                  Buy with {selectedCurrency}
                </button>

                {/* Treasury note */}
                <p
                  className={`text-[10px] text-center mt-2 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  All proceeds go to the Bank of BUDJU treasury
                </p>
              </div>
            )}

            {purchaseStep === "confirm" && (
              <div
                className={`p-4 rounded-xl border ${isDarkMode ? "bg-white/[0.03] border-white/[0.06]" : "bg-gray-50 border-gray-100"}`}
              >
                <h3
                  className={`font-bold mb-3 ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  Confirm Purchase
                </h3>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }
                    >
                      NFT
                    </span>
                    <span
                      className={
                        isDarkMode ? "text-white" : "text-gray-900"
                      }
                    >
                      {nft.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }
                    >
                      Price
                    </span>
                    <span
                      className={`font-bold ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}
                    >
                      ${nft.price.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }
                    >
                      Currency
                    </span>
                    <span className="flex items-center gap-1">
                      <img
                        src={CURRENCY_INFO[selectedCurrency].icon}
                        alt=""
                        className="w-4 h-4 rounded-full"
                      />
                      {selectedCurrency}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span
                      className={
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }
                    >
                      Recipient
                    </span>
                    <span
                      className={`font-mono text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                    >
                      {BANK_ADDRESS.slice(0, 4)}...{BANK_ADDRESS.slice(-4)}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setPurchaseStep("browse")}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${isDarkMode ? "bg-white/10 text-white hover:bg-white/20" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmPurchase}
                    className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-budju-pink to-budju-blue text-white hover:opacity-90 transition-opacity"
                  >
                    Connect Wallet & Pay
                  </button>
                </div>
                <p
                  className={`text-[10px] text-center mt-2 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  You will be prompted to approve the transaction in your wallet
                </p>
              </div>
            )}

            {purchaseStep === "processing" && (
              <div className="text-center py-6">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-budju-pink border-t-transparent animate-spin" />
                <p
                  className={`font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  Processing transaction...
                </p>
                <p
                  className={`text-sm mt-1 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  Please confirm in your wallet
                </p>
              </div>
            )}

            {purchaseStep === "success" && (
              <div className="text-center py-6">
                <FaCheckCircle
                  className="mx-auto mb-3 text-green-400"
                  size={40}
                />
                <p
                  className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  Purchase Complete!
                </p>
                <p
                  className={`text-sm mt-1 mb-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                >
                  {nft.name} is now yours. It will appear in your wallet
                  shortly.
                </p>
                <div className="flex gap-2 justify-center">
                  <a
                    href={`https://solscan.io/account/${BANK_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border transition-colors ${isDarkMode ? "border-white/10 text-gray-400 hover:text-white" : "border-gray-200 text-gray-500 hover:text-gray-700"}`}
                  >
                    <FaExternalLinkAlt size={10} /> View on Solscan
                  </a>
                  <button
                    onClick={onClose}
                    className="text-xs px-3 py-2 rounded-lg bg-gradient-to-r from-budju-pink to-budju-blue text-white font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Blockchain info */}
            <div
              className={`mt-4 pt-4 border-t ${isDarkMode ? "border-white/[0.06]" : "border-gray-100"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  Blockchain
                </span>
                <span
                  className={`text-xs font-medium ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}
                >
                  Solana
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  Token
                </span>
                <span
                  className={`text-[10px] font-mono ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  {TOKEN_ADDRESS.slice(0, 6)}...{TOKEN_ADDRESS.slice(-4)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span
                  className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  Treasury
                </span>
                <a
                  href={`https://solscan.io/account/${BANK_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-budju-blue hover:underline"
                >
                  {BANK_ADDRESS.slice(0, 6)}...{BANK_ADDRESS.slice(-4)}
                </a>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default NFTDetailModal;
