// src/components/common/Web3Background.tsx
import { useEffect, useRef, useState } from "react";

interface Web3BackgroundProps {
  className?: string;
  children?: React.ReactNode;
}

const Web3Background: React.FC<Web3BackgroundProps> = ({
  className = "",
  children,
}) => {
  const particlesContainerRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize particles on component mount
  useEffect(() => {
    if (particlesContainerRef.current && !isInitialized) {
      const container = particlesContainerRef.current;
      const particleCount = 30;

      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.classList.add("web3-particle");

        // Random size
        const size = Math.random() * 6 + 2;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;

        // Random position
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.left = `${Math.random() * 100}%`;

        // Random animation delay
        particle.style.animationDelay = `${Math.random() * 8}s`;

        container.appendChild(particle);
      }

      setIsInitialized(true);
    }

    return () => {
      // Clean up particles when component unmounts
      if (particlesContainerRef.current) {
        particlesContainerRef.current.innerHTML = "";
      }
    };
  }, [isInitialized]);

  return (
    <div className={`web3-background-container ${className}`}>
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

      {/* Render children on top of the background */}
      {children}
    </div>
  );
};

export default Web3Background;
