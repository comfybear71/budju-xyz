import { memo } from "react";
import { motion } from "framer-motion";
import { useAnimationObserver } from "@/hooks/useAnimationObserver";

interface SectionTitleProps {
  whiteText: string;
  blueText: string;
  centered?: boolean;
  className?: string;
}

const SectionTitle = ({
  whiteText,
  blueText,
  centered = true,
  className = "",
}: SectionTitleProps) => {
  const [ref, controls] = useAnimationObserver();

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const textVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6 },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={`${centered ? "text-center" : ""} mb-6 ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate={controls}
    >
      <motion.h2 className="text-2xl font-bold md:text-3xl lg:text-4xl">
        <motion.span variants={textVariants} className="text-white">
          {whiteText}
        </motion.span>{" "}
        <motion.span variants={textVariants} className="text-light-blue">
          {blueText}
        </motion.span>
      </motion.h2>
    </motion.div>
  );
};

export default memo(SectionTitle);
