import { useState } from "react";
import { FaCopy, FaCheck } from "react-icons/fa";
import { AnimatePresence, motion } from "motion/react";

interface CopyToClipboardProps {
  text: string;
  successMessage?: string;
  className?: string;
  iconSize?: number;
  showPopup?: boolean;
}

const CopyToClipboard = ({
  text,
  successMessage = "Copied!",
  className = "",
  iconSize = 16,
  showPopup = true,
}: CopyToClipboardProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy text:", error);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        onClick={handleCopy}
        className="ml-2 p-1.5 rounded-full hover:bg-gray-800 transition-colors duration-300 focus:outline-none"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <FaCheck size={iconSize} className="text-green-500" />
        ) : (
          <FaCopy
            size={iconSize}
            className="text-budju-blue hover:text-budju-blue-light"
          />
        )}
      </button>

      {/* Success Popup */}
      {showPopup && (
        <AnimatePresence>
          {copied && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 top-full mt-2 bg-green-500 text-white text-sm px-3 py-1 rounded-md shadow-lg"
            >
              {successMessage}
              <div className="absolute -top-1 right-4 w-2 h-2 bg-green-500 transform rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default CopyToClipboard;
