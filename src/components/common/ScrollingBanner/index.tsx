import { useMemo } from "react";

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
  // Generate repeated text with proper spacing
  const repeatedText = useMemo(() => {
    return Array(repetitions).fill(text).join(" ");
  }, [text, repetitions]);

  // Determine animation duration based on speed
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

  // Create animation style directly
  const animationStyle = {
    animation: `${reverse ? "marquee-reverse" : "marquee"} ${getDuration()} linear infinite`,
  };

  return (
    <div className={`w-full overflow-hidden bg-black py-3 ${className}`}>
      <div className="flex whitespace-nowrap">
        {/* Just one long continuous text element */}
        <div className={`inline-block ${textClassName}`} style={animationStyle}>
          {repeatedText}
        </div>
      </div>
    </div>
  );
};

// Pre-configured BUDJU Parade Banner
export const BudjuParadeBanner = () => {
  return (
    <ScrollingBanner
      text="* JOIN THE BUDJU PARADE *"
      repetitions={10}
      className="bg-black border-y border-budju-pink/20"
      textClassName="text-xl md:text-2xl font-bold text-white px-4"
    />
  );
};

export default ScrollingBanner;
