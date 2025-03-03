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

  return (
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
        <div className="hidden lg:flex items-center space-x-4 xl:space-x-8">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`relative font-semibold text-base xl:text-lg transform transition duration-300 hover:text-budju-pink ${
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
        <div className="hidden lg:flex items-center space-x-3 xl:space-x-4">
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
        <div className="lg:hidden flex items-center">
          <a
            href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
            target="_blank"
            rel="noopener noreferrer"
            className="mr-3 text-xs sm:text-sm budju-button-primary py-1.5 sm:py-2 px-3 sm:px-4"
          >
            BUY BUDJU
          </a>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white focus:outline-none"
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

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed top-[53px] sm:top-[61px] left-0 right-0 bottom-0 bg-black/95 backdrop-blur-lg shadow-lg overflow-y-auto"
          >
            <div className="px-4 py-4 space-y-2 max-h-[calc(100vh-61px)] overflow-y-auto">
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

              <div className="py-4 px-4">
                <WalletConnect fullWidth />
              </div>

              {/* Mobile Menu Footer */}
              <div className="pt-4 pb-6 px-4 flex justify-center">
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
