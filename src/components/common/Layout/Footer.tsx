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
import { ROUTES } from "@/constants/routes";

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

  const linkClass = `text-sm transition-colors duration-300 ${
    isDarkMode
      ? "text-gray-500 hover:text-budju-pink"
      : "text-gray-400 hover:text-budju-pink"
  }`;

  return (
    <footer className="relative">
      {/* Top Divider */}
      <div className="budju-section-divider"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-6">
        {/* 4-Column Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10 mb-10">
          {/* Column 1 — Brand & Social */}
          <div className="flex flex-col items-center sm:items-start">
            <Link to="/" className="mb-4">
              <img
                src="/images/logo.svg"
                alt="BUDJU Coin Logo"
                className="h-12 w-auto"
              />
            </Link>
            <p
              className={`text-sm leading-relaxed mb-5 text-center sm:text-left ${
                isDarkMode ? "text-gray-500" : "text-gray-400"
              }`}
            >
              Join the BUDJU Parade and be part of Solana's most vibrant community.
            </p>

            {/* Social Icons in Glass Containers */}
            <div ref={socialIconsRef} className="flex flex-wrap gap-2">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`social-icon flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 ${
                    isDarkMode
                      ? "bg-white/5 text-gray-400 hover:bg-budju-pink/15 hover:text-budju-pink border border-white/5"
                      : "bg-gray-100 text-gray-500 hover:bg-budju-pink/10 hover:text-budju-pink border border-gray-200"
                  }`}
                  aria-label={social.name}
                >
                  <social.icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Column 2 — Ecosystem */}
          <div className="flex flex-col items-center sm:items-start">
            <h4
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Ecosystem
            </h4>
            <ul className="space-y-2.5">
              <li><Link to={ROUTES.SWAP} className={linkClass}>Swap</Link></li>
              <li><Link to={ROUTES.POOL} className={linkClass}>Liquidity Pools</Link></li>
              <li><Link to={ROUTES.BANK} className={linkClass}>Bank of BUDJU</Link></li>
              <li><Link to={ROUTES.NFT} className={linkClass}>NFT Collection</Link></li>
              <li>
                <a
                  href="https://shop.budjucoin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  BUDJU Shop
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3 — Resources */}
          <div className="flex flex-col items-center sm:items-start">
            <h4
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Resources
            </h4>
            <ul className="space-y-2.5">
              <li><Link to={ROUTES.TOKENOMICS} className={linkClass}>Tokenomics</Link></li>
              <li><Link to={ROUTES.BURN} className={linkClass}>Burn Statistics</Link></li>
              <li><Link to={ROUTES.HOW_TO_BUY} className={linkClass}>How To Buy</Link></li>
              <li>
                <a
                  href="https://solscan.io/token/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  Solscan
                </a>
              </li>
              <li>
                <a
                  href="https://dexscreener.com/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  DexScreener
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4 — Token Info */}
          <div className="flex flex-col items-center sm:items-start">
            <h4
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Token Info
            </h4>
            <div className="space-y-3 w-full">
              <div>
                <p
                  className={`text-xs font-medium mb-1 ${
                    isDarkMode ? "text-gray-600" : "text-gray-500"
                  }`}
                >
                  Contract Address
                </p>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-mono truncate max-w-[160px] ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {TOKEN_ADDRESS}
                  </span>
                  <CopyToClipboard text={TOKEN_ADDRESS} />
                </div>
              </div>
              <div>
                <p
                  className={`text-xs font-medium mb-1 ${
                    isDarkMode ? "text-gray-600" : "text-gray-500"
                  }`}
                >
                  Network
                </p>
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Solana
                </p>
              </div>
              <div>
                <p
                  className={`text-xs font-medium mb-1 ${
                    isDarkMode ? "text-gray-600" : "text-gray-500"
                  }`}
                >
                  Total Supply
                </p>
                <p className={`text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
                  1,000,000,000 BUDJU
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="budju-section-divider mb-6"></div>
        <div
          className={`flex flex-col sm:flex-row items-center justify-between gap-2 text-xs ${
            isDarkMode ? "text-gray-600" : "text-gray-500"
          }`}
        >
          <p>&copy; {new Date().getFullYear()} BUDJU Coin. All rights reserved.</p>
          <p>
            <span className="text-budju-pink font-medium">JOIN THE BUDJU PARADE</span>
            {" "}&middot;{" "}
            This is not financial advice
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
