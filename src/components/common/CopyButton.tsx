import { memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCopyToClipboard } from "src/hooks/useCopyToClipboard";

interface CopyButtonProps {
  text: string;
  showFullText?: boolean;
  maxLength?: number;
}

const CopyButton = ({
  text,
  showFullText = true,
  maxLength = 10,
}: CopyButtonProps) => {
  const { copyStatus, copyToClipboard } = useCopyToClipboard();

  const handleCopy = () => {
    copyToClipboard(text);
  };

  const displayText = showFullText
    ? text
    : `${text.substring(0, maxLength)}...${text.substring(text.length - 4)}`;

  return (
    <div className="flex items-center">
      <span className="font-mono text-sm text-gray-200 md:text-base">
        {displayText}
      </span>

      <motion.button
        onClick={handleCopy}
        className="inline-flex items-center justify-center w-8 h-8 ml-2 text-white bg-gray-700 rounded-full hover:bg-gray-600"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        aria-label="Copy to clipboard"
      >
        <i className="fas fa-copy"></i>
      </motion.button>

      <AnimatePresence>
        {copyStatus === "copied" && (
          <motion.div
            className="px-2 py-1 ml-2 text-xs text-white bg-green-500 rounded"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            Copied!
          </motion.div>
        )}

        {copyStatus === "error" && (
          <motion.div
            className="px-2 py-1 ml-2 text-xs text-white bg-red-500 rounded"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            Failed to copy
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default memo(CopyButton);
