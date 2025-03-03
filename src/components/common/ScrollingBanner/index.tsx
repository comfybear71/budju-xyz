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
  repetitions = 5,
  speed = "normal",
  reverse = false,
  className = "",
  textClassName = "",
}: ScrollingBannerProps) => {
  // Generate repeated text
  const repeatedText = useMemo(() => {
    return Array(repetitions).fill(text).join(" ");
  }, [text, repetitions]);

  // Determine animation duration based on speed
  const getDurationClass = () => {
    switch (speed) {
      case "slow":
        return "animate-[marquee_40s_linear_infinite]";
      case "fast":
        return "animate-[marquee_15s_linear_infinite]";
      case "normal":
      default:
        return "animate-[marquee_25s_linear_infinite]";
    }
  };

  // Determine animation direction
  const getDirectionClass = () => {
    return reverse
      ? "animate-[marquee-reverse_25s_linear_infinite]"
      : getDurationClass();
  };

  return (
    <div className={`w-full overflow-hidden bg-budju-black py-3 ${className}`}>
      <div className="relative whitespace-nowrap flex">
        {/* First copy for continuous loop */}
        <div className={`inline-block ${getDirectionClass()} ${textClassName}`}>
          {repeatedText}
        </div>

        {/* Duplicate to ensure smooth infinite loop */}
        <div
          className={`inline-block ${getDirectionClass()} ${textClassName} absolute top-0 left-full`}
        >
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
      repetitions={8}
      className="bg-budju-black border-y border-budju-pink/20"
      textClassName="text-xl md:text-2xl font-bold text-white px-4"
    />
  );
};

export default ScrollingBanner;
