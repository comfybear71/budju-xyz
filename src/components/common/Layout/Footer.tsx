import { useEffect, useRef } from "react";
import { Link } from "react-router";
import {
  FaFacebook,
  FaTelegram,
  FaInstagram,
  FaTwitter,
  FaTiktok,
  FaPills,
} from "react-icons/fa";
import { gsap } from "gsap";

// Import token address from constants
import CopyToClipboard from "@components/common/CopyToClipboard";
import { TOKEN_ADDRESS } from "@/constants/addresses";

const socialLinks = [
  {
    name: "Facebook",
    icon: FaFacebook,
    url: "https://www.facebook.com/share/g/167RuPUSM1/?mibextid=wwXIfr",
  },
  {
    name: "Telegram",
    icon: FaTelegram,
    url: "http://t.me/budjucoingroup",
  },
  {
    name: "Instagram",
    icon: FaInstagram,
    url: "https://www.instagram.com/budjucoin?igsh=YnV5N2x0M2Q4OG1i&utm_source=qr",
  },
  {
    name: "Twitter",
    icon: FaTwitter,
    url: "https://x.com/budjucoin?s=21",
  },
  {
    name: "TikTok",
    icon: FaTiktok,
    url: "https://www.tiktok.com/@budjucoin",
  },
  {
    name: "Pump.fun",
    icon: FaPills,
    url: "https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump?coins_sort=market_cap",
  },
];

const Footer = () => {
  const footerRef = useRef<HTMLDivElement>(null);
  const socialIconsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Add hover animations to social icons
    if (socialIconsRef.current) {
      const icons = socialIconsRef.current.querySelectorAll(".social-icon");

      icons.forEach((icon) => {
        icon.addEventListener("mouseenter", () => {
          gsap.to(icon, {
            y: -5,
            scale: 1.2,
            duration: 0.3,
            ease: "power1.out",
          });
        });

        icon.addEventListener("mouseleave", () => {
          gsap.to(icon, {
            y: 0,
            scale: 1,
            duration: 0.5,
            ease: "elastic.out(1, 0.5)",
          });
        });
      });
    }
  }, []);

  return (
    <footer ref={footerRef} className="bg-black pt-12 pb-6">
      <div className="budju-container">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Logo & About */}
          <div className="flex flex-col items-center md:items-start">
            <Link to="/" className="mb-4">
              <img
                src="src/assets/images/logo.png"
                alt="BUDJU Coin Logo"
                className="h-16 w-auto"
              />
            </Link>
            <p className="text-gray-400 text-center md:text-left">
              Join the BUDJU Parade and be part of Solana's most vibrant
              community. BUDJU Coin - a movement, a vibe, a lifestyle.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-2xl font-bold mb-4 text-budju-pink">
              Quick Links
            </h3>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/nft"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  NFT Collection
                </Link>
              </li>
              <li>
                <Link
                  to="/how-to-buy"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  How To Buy
                </Link>
              </li>
              <li>
                <Link
                  to="/shop"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  Shop of BUDJU
                </Link>
              </li>
              <li>
                <Link
                  to="/tokenomics"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  Tokenomics
                </Link>
              </li>
              <li>
                <Link
                  to="/bank"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  Bank of BUDJU
                </Link>
              </li>
              <li>
                <a
                  href="https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-budju-blue transition duration-300"
                >
                  Solscan
                </a>
              </li>
            </ul>
          </div>

          {/* Token Info */}
          <div className="flex flex-col items-center md:items-start">
            <h3 className="text-2xl font-bold mb-4 text-budju-blue">
              Token Info
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-gray-400">Token Address:</p>
                <div className="flex items-center mt-1">
                  <span className="text-sm text-gray-300 font-mono truncate max-w-xs">
                    {TOKEN_ADDRESS}
                  </span>
                  <CopyToClipboard text={TOKEN_ADDRESS} />
                </div>
              </div>
              <div>
                <p className="text-gray-400">Network:</p>
                <p className="text-gray-300">Solana</p>
              </div>
              <div>
                <p className="text-gray-400">Total Supply:</p>
                <p className="text-gray-300">1,000,000,000 BUDJU</p>
              </div>
              <div className="pt-2">
                <a
                  href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="budju-button-primary text-sm py-2 px-4"
                >
                  BUY BUDJU
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Social Icons */}
        <div
          ref={socialIconsRef}
          className="flex justify-center items-center py-6 border-t border-gray-800"
        >
          {socialLinks.map((social, index) => (
            <a
              key={index}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="social-icon mx-3 text-white hover:text-budju-pink transition-colors duration-300"
              aria-label={social.name}
            >
              <social.icon size={28} />
            </a>
          ))}
        </div>

        {/* Copyright */}
        <div className="text-center text-gray-500 text-sm mt-6">
          <p>© {new Date().getFullYear()} BUDJU Coin. All rights reserved.</p>
          <p className="mt-1">
            <span className="text-budju-pink">JOIN THE BUDJU PARADE</span> •
            This is not financial advice
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
