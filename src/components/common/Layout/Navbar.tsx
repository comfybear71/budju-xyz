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
  { name: "Pool of BUDJU", path: "/pool" },
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

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Toggle menu function
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <nav
        className={`
        fixed top-0 left-0 right-0 z-50 transition-all duration-300 
        px-3 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-3
        ${scrolled ? "bg-black/80 backdrop-blur-md shadow-lg" : "bg-transparent"}
      `}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <img
              src={LogoImage}
              alt="BUDJU Coin Logo"
              className="navbar-logo h-10 sm:h-12 md:h-14 w-auto transition-all duration-300"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center space-x-4 xl:space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`relative font-semibold text-base transform transition duration-300 hover:text-budju-pink ${
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
          <div className="hidden xl:flex items-center space-x-3 xl:space-x-4">
            <WalletConnect />

            <a
              href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
              target="_blank"
              rel="noopener noreferrer"
              className="budju-button-primary text-sm xl:text-base py-2 px-3 xl:px-4"
            >
              BUY BUDJU
            </a>
          </div>

          {/* Mobile Menu Button & Buy Button */}
          <div className="xl:hidden flex items-center">
            <a
              href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
              target="_blank"
              rel="noopener noreferrer"
              className="mr-3 text-xs sm:text-sm budju-button-primary py-1.5 sm:py-2 px-3 sm:px-4"
            >
              BUY BUDJU
            </a>

            <button
              onClick={toggleMenu}
              className="text-white focus:outline-none p-2"
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? (
                <FaTimes size={22} className="text-budju-pink" />
              ) : (
                <FaBars size={22} />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Separate Mobile Menu Overlay with Animation */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-black z-[100] overflow-auto"
            style={{ touchAction: "pan-y" }}
          >
            {/* Mobile Menu Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="flex items-center justify-between px-4 py-3 border-b border-gray-800"
            >
              <img
                src={LogoImage}
                alt="BUDJU Coin Logo"
                className="h-10 w-auto"
              />
              <button
                onClick={toggleMenu}
                className="text-white focus:outline-none p-2"
                aria-label="Close menu"
              >
                <FaTimes size={24} className="text-budju-pink" />
              </button>
            </motion.div>

            {/* Navigation Links with Staggered Animation */}
            <div className="p-4 space-y-2">
              {navItems.map((item, index) => (
                <motion.div
                  key={item.path}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
                >
                  <Link
                    to={item.path}
                    className={`block py-3 px-4 font-medium rounded-lg transition-colors ${
                      location.pathname === item.path
                        ? "bg-budju-pink/20 text-budju-pink"
                        : "text-white hover:bg-gray-800"
                    }`}
                    onClick={toggleMenu}
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Wallet Connect with Animation */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="px-8 py-4"
            >
              <WalletConnect fullWidth size="lg" />
            </motion.div>

            {/* Footer Banner with Animation */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className="absolute bottom-0 left-0 right-0 py-4 border-t border-gray-800"
            >
              <div className="overflow-hidden whitespace-nowrap">
                <div className="animate-[marquee_25s_linear_infinite]">
                  * JOIN THE BUDJU PARADE * JOIN THE BUDJU PARADE * JOIN THE
                  BUDJU PARADE *
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
