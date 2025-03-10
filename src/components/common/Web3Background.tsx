import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";

interface Web3BackgroundProps {
  className?: string;
  children?: React.ReactNode;
  height?: string; // New prop for controlling height
}

const Web3Background: React.FC<Web3BackgroundProps> = ({
  className = "",
  children,
  height = "min-h-[50vh]", // Default height
}) => {
  const { isDarkMode } = useTheme();
  const particlesContainerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (particlesContainerRef.current && !isInitialized) {
      const container = particlesContainerRef.current;
      const particleCount = 30;

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.classList.add("web3-particle");

        const size = Math.random() * 6 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.animationDelay = `${Math.random() * 8}s`;

        // Adjust particle color based on theme (unchanged)
        particle.style.backgroundColor = isDarkMode
          ? "rgba(255, 105, 180, 0.5)" // Hot pink for dark mode
          : "rgba(255, 255, 255, 0.6)"; // Original for light mode

        container.appendChild(particle);
      }

      setIsInitialized(true);
    }

    // Cleanup function to remove particles on unmount
    return () => {
      if (particlesContainerRef.current) {
        particlesContainerRef.current.innerHTML = "";
        setIsInitialized(false); // Reset initialization state
      }
    };
  }, [isDarkMode]); // Only re-run if isDarkMode changes

  return (
    <div
      className={`web3-background-container ${height} ${className} ${
        isDarkMode ? "dark-mode" : ""
      }`}
    >
      <div className="web3-grid"></div>
      <div className="web3-glow" style={{ top: "20%", left: "30%" }}></div>
      <div className="web3-glow" style={{ top: "60%", left: "70%" }}></div>
      <div className="web3-glow" style={{ top: "40%", left: "50%" }}></div>
      <div className="web3-blockchain" style={{ top: "30%", left: "10%" }}>
        <div className="web3-block"></div>
        <div className="web3-block"></div>
        <div className="web3-block"></div>
        <div className="web3-block"></div>
      </div>
      <div className="web3-blockchain" style={{ top: "70%", left: "40%" }}>
        <div className="web3-block"></div>
        <div className="web3-block"></div>
        <div className="web3-block"></div>
      </div>
      <div ref={particlesContainerRef} className="web3-particles"></div>
      <div className="relative z-10">{children}</div>{" "}
      {/* Wrap children in a relative container */}
    </div>
  );
};

export default Web3Background;
