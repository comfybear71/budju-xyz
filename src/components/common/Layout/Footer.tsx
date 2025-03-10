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
import CopyToClipboard from "@components/common/CopyToClipboard";
import { TOKEN_ADDRESS } from "@/constants/addresses";
import { useTheme } from "@/context/ThemeContext";

const socialLinks = [
  {
    name: "Facebook",
    icon: FaFacebook,
    url: "https://www.facebook.com/share/g/167RuPUSM1/?mibextid=wwXIfr",
  },
  { name: "Telegram", icon: FaTelegram, url: "http://t.me/budjucoingroup" },
  {
    name: "Instagram",
    icon: FaInstagram,
    url: "https://www.instagram.com/budjucoin?igsh=YnV5N2x0M2Q4OG1i&utm_source=qr",
  },
  { name: "Twitter", icon: FaTwitter, url: "https://x.com/budjucoin?s=21" },
  { name: "TikTok", icon: FaTiktok, url: "https://www.tiktok.com/@budjucoin" },
  {
    name: "Pump.fun",
    icon: FaPills,
    url: "https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump?coins_sort=market_cap",
  },
];

const Footer = () => {
  const { isDarkMode } = useTheme();
  const footerRef = useRef<HTMLDivElement>(null);
  const socialIconsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (socialIconsRef.current) {
      const icons = socialIconsRef.current.querySelectorAll(".social-icon");
      icons.forEach((icon) => {
        icon.addEventListener("mouseenter", () =>
          gsap.to(icon, {
            y: -5,
            scale: 1.2,
            duration: 0.3,
            ease: "power1.out",
          }),
        );
        icon.addEventListener("mouseleave", () =>
          gsap.to(icon, {
            y: 0,
            scale: 1,
            duration: 0.5,
            ease: "elastic.out(1, 0.5)",
          }),
        );
      });
    }
  }, []);

  return (
    <footer ref={footerRef} className="pt-6 pb-4">
      <div className="budju-container px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Logo and Description */}
          <div className="flex flex-col items-center md:items-start text-center">
            <Link to="/" className="mb-2">
              <img
                src="/images/logo.svg"
                alt="BUDJU Coin Logo"
                className="h-12 w-auto md:h-16"
              />
            </Link>
            <p
              className={`${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              } text-xs leading-tight md:text-sm md:leading-relaxed`}
            >
              Join the BUDJU Parade and be part of Solana's most vibrant
              community. BUDJU Coin - a movement, a vibe, a lifestyle.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <h3 className="text-xl font-bold mb-2 text-budju-pink">
              Quick Links
            </h3>
            <ul className="space-y-1 text-xs md:text-sm">
              <li>
                <Link
                  to="/nft"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  NFT Collection
                </Link>
              </li>
              <li>
                <Link
                  to="/how-to-buy"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  How To Buy
                </Link>
              </li>
              <li>
                <Link
                  to="/shop"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  Shop of BUDJU
                </Link>
              </li>
              <li>
                <Link
                  to="/tokenomics"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  Tokenomics
                </Link>
              </li>
              <li>
                <Link
                  to="/bank"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  Bank of BUDJU
                </Link>
              </li>
              <li>
                <a
                  href="https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  } hover:text-budju-blue transition duration-300`}
                >
                  Solscan
                </a>
              </li>
            </ul>
          </div>

          {/* Token Info */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <h3 className="text-xl font-bold mb-2 text-budju-blue">
              Token Info
            </h3>
            <div className="space-y-2 text-xs md:text-sm">
              <div>
                <p
                  className={`${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  } font-medium`}
                >
                  Token Address:
                </p>
                <div className="flex items-center mt-1 space-x-2">
                  <span
                    className={`text-[10px] md:text-xs ${
                      isDarkMode ? "text-gray-400" : "text-gray-300"
                    } font-mono break-all md:truncate md:max-w-[180px]`}
                  >
                    {TOKEN_ADDRESS}
                  </span>
                  <CopyToClipboard text={TOKEN_ADDRESS} />
                </div>
              </div>
              <div>
                <p
                  className={`${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  } font-medium`}
                >
                  Network:
                </p>
                <p
                  className={`mt-1 ${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  }`}
                >
                  Solana
                </p>
              </div>
              <div>
                <p
                  className={`${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  } font-medium`}
                >
                  Total Supply:
                </p>
                <p
                  className={`mt-1 ${
                    isDarkMode ? "text-gray-400" : "text-gray-300"
                  }`}
                >
                  1,000,000,000 BUDJU
                </p>
              </div>
              <div className="pt-2">
                <a
                  href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-block group relative font-bold text-xs md:text-lg py-1 md:py-2 px-4 md:px-8 rounded-xl shadow-lg transition-all duration-300 transform hover:scale-105 hover:shadow-xl cursor-pointer ${
                    isDarkMode
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-gray-600/20"
                      : "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-white/20"
                  } border-2 active:scale-95 active:shadow-md`}
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "scale(1.05)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "scale(1)")
                  }
                >
                  <span
                    className={`absolute inset-0 rounded-xl bg-[radial-gradient(circle_at_center,_rgba(255,255,255,${
                      isDarkMode ? "0.2" : "0.3"
                    })_0%,_rgba(255,255,255,0)_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                  />
                  BUY BUDJU
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Social Icons */}
        <div
          ref={socialIconsRef}
          className={`flex justify-center items-center py-3 border-t ${
            isDarkMode ? "border-gray-700" : "border-gray-800"
          }`}
        >
          {socialLinks.map((social, index) => (
            <a
              key={index}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`social-icon mx-2 ${
                isDarkMode ? "text-gray-300" : "text-white"
              } hover:text-budju-pink transition-colors duration-300`}
              aria-label={social.name}
            >
              <social.icon size={24} />
            </a>
          ))}
        </div>

        {/* Copyright */}
        <div
          className={`text-center ${
            isDarkMode ? "text-gray-600" : "text-gray-500"
          } text-xs mt-3`}
        >
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
