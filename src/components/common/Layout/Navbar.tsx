import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { FaBars, FaTimes } from "react-icons/fa";
import { gsap } from "gsap";

// Import logo from assets
import LogoImage from "@assets/images/logo.png";
import WalletConnect from "../WalletConnect";

interface NavItem {
  name: string;
  path: string;
}

const navItems: NavItem[] = [
  { name: "Home", path: "/" },
  { name: "NFT Collection", path: "/nft" },
  { name: "How To Buy", path: "/how-to-buy" },
  { name: "Shop", path: "/shop" },
  { name: "Tokenomics", path: "/tokenomics" },
  { name: "Bank of BUDJU", path: "/bank" },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  // Animate logo on hover
  useEffect(() => {
    const logo = document.querySelector(".navbar-logo");

    if (logo) {
      logo.addEventListener("mouseenter", () => {
        gsap.to(logo, {
          rotation: 10,
          scale: 1.1,
          duration: 0.3,
          ease: "power1.out",
        });
      });

      logo.addEventListener("mouseleave", () => {
        gsap.to(logo, {
          rotation: 0,
          scale: 1,
          duration: 0.5,
          ease: "elastic.out(1, 0.5)",
        });
      });
    }
  }, []);

  return (
    <nav
      className={`
      fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 md:px-8 py-3
      ${scrolled ? "bg-black/80 backdrop-blur-md shadow-lg" : "bg-transparent"}
    `}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          <img
            src={LogoImage}
            alt="BUDJU Coin Logo"
            className="navbar-logo h-12 md:h-14 w-auto"
          />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`relative font-semibold text-lg transform transition duration-300 hover:text-budju-pink ${
                location.pathname === item.path
                  ? "text-budju-pink"
                  : "text-white"
              }`}
            >
              {item.name}
              {location.pathname === item.path && (
                <motion.div
                  layoutId="navbar-indicator"
                  className="absolute -bottom-1 left-0 right-0 h-0.5 bg-budju-pink"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              )}
            </Link>
          ))}
        </div>

        {/* Wallet Connect & Buy Button */}
        <div className="hidden md:flex items-center space-x-4">
          <WalletConnect />

          <a
            href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
            target="_blank"
            rel="noopener noreferrer"
            className="budju-button-primary"
          >
            BUY BUDJU
          </a>
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden flex items-center">
          <a
            href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
            target="_blank"
            rel="noopener noreferrer"
            className="mr-4 text-sm budju-button-primary py-2 px-4"
          >
            BUY BUDJU
          </a>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white focus:outline-none"
          >
            {isOpen ? (
              <FaTimes size={24} className="text-budju-pink" />
            ) : (
              <FaBars size={24} />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-lg shadow-lg py-4"
          >
            <div className="px-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`block py-3 px-4 font-medium rounded-lg transition duration-300 ${
                    location.pathname === item.path
                      ? "bg-budju-pink/20 text-budju-pink"
                      : "text-white hover:bg-gray-800"
                  }`}
                >
                  {item.name}
                </Link>
              ))}

              <div className="py-2 px-4">
                <WalletConnect fullWidth />
              </div>

              {/* Mobile Menu Footer */}
              <div className="pt-4 pb-2 px-4 flex justify-center">
                <div className="scrolling-banner w-full overflow-hidden">
                  <div className="scrolling-banner-content">
                    * JOIN THE BUDJU PARADE * JOIN THE BUDJU PARADE * JOIN THE
                    BUDJU PARADE *
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
