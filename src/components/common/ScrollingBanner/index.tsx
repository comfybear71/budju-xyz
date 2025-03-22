import { useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";

interface ScrollingBannerProps {
  text: string;
  repetitions?: number;
  speed?: "slow" | "normal" | "fast";
  reverse?: boolean;
  className?: string;
  textClassName?: string;
}

const ScrollingBanner = ({
  text,
  repetitions = 10,
  speed = "normal",
  reverse = false,
  className = "",
  textClassName = "",
}: ScrollingBannerProps) => {
  const { isDarkMode } = useTheme();

  const repeatedText = useMemo(() => {
    return Array(repetitions).fill(text).join(" ");
  }, [text, repetitions]);

  const getDuration = () => {
    switch (speed) {
      case "slow":
        return "40s";
      case "fast":
        return "15s";
      case "normal":
      default:
        return "25s";
    }
  };

  const animationStyle = {
    animation: `${reverse ? "marquee-reverse" : "marquee"} ${getDuration()} linear infinite`,
  };

  return (
    <div
      className={`w-full overflow-hidden py-3 ${
        isDarkMode
          ? "bg-gray-900 border-y border-budju-pink/20"
          : "bg-gray-100 border-y border-budju-pink/30"
      } ${className}`}
    >
      <div className="flex whitespace-nowrap">
        <div
          className={`inline-block ${
            isDarkMode ? "text-white" : "text-gray-800"
          } text-base sm:text-lg md:text-xl font-bold px-4 ${textClassName}`}
          style={animationStyle}
        >
          {repeatedText}
        </div>
      </div>
    </div>
  );
};

export const BudjuParadeBanner = () => {
  const { isDarkMode } = useTheme();
  return (
    <ScrollingBanner
      text="* JOIN THE BUDJU PARADE *"
      repetitions={10}
      className={`${isDarkMode ? "bg-gray-900" : "bg-gray-100"} border-y border-budju-pink/20`}
      textClassName="text-xl md:text-2xl font-bold px-4"
    />
  );
};

export default ScrollingBanner;
