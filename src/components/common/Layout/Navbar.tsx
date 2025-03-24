import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  FaBars,
  FaTimes,
  FaExchangeAlt,
  FaShoppingCart,
  FaPiggyBank,
  FaSwimmingPool,
  FaChartBar,
  FaSun,
  FaMoon,
  FaAngleDown,
  FaBahai,
  FaQuestion,
  FaArrowDown,
  FaFire,
} from "react-icons/fa";
import { gsap } from "gsap";
import { useTheme } from "@/context/ThemeContext";
import WalletConnect from "../WalletConnect";
import { ROUTES, ROUTE_NAMES } from "@/constants/routes";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";

interface IconComponentProps {
  className?: string;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<IconComponentProps>;
}

const mainNavItems: NavItem[] = [
  { name: ROUTE_NAMES[ROUTES.SWAP], path: ROUTES.SWAP, icon: FaExchangeAlt },
  {
    name: ROUTE_NAMES[ROUTES.SHOP],
    path: "https://shop.budjucoin.com",
    icon: FaShoppingCart,
  },
  { name: ROUTE_NAMES[ROUTES.BANK], path: ROUTES.BANK, icon: FaPiggyBank },
  { name: ROUTE_NAMES[ROUTES.POOL], path: ROUTES.POOL, icon: FaSwimmingPool },
  {
    name: ROUTE_NAMES[ROUTES.TOKENOMICS],
    path: ROUTES.TOKENOMICS,
    icon: FaChartBar,
  },
];

const moreNavItems: NavItem[] = [
  {
    name: ROUTE_NAMES[ROUTES.BURN], // "Burn"
    path: ROUTES.BURN,             // e.g., "/burn"
    icon: FaFire,                  // Flame icon
  },
  { name: ROUTE_NAMES[ROUTES.NFT], 
    path: ROUTES.NFT, 
    icon: FaBahai 
  },
  {
    name: ROUTE_NAMES[ROUTES.HOW_TO_BUY],
    path: ROUTES.HOW_TO_BUY,
    icon: FaQuestion,
  },
  
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const location = useLocation();
  const { isDarkMode, toggleTheme } = useTheme();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setDropdownOpen(false);
  }, [location]);

  useEffect(() => {
    const logo = document.querySelector(".navbar-logo");
    if (logo) {
      logo.addEventListener("mouseenter", () =>
        gsap.to(logo, {
          rotation: 10,
          scale: 1.1,
          duration: 0.3,
          ease: "power2.out",
        }),
      );
      logo.addEventListener("mouseleave", () =>
        gsap.to(logo, {
          rotation: 0,
          scale: 1,
          duration: 0.5,
          ease: "elastic.out(1, 0.3)",
        }),
      );
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);
  const toggleDropdown = () => setDropdownOpen(!dropdownOpen);

  const buttonVariants = {
    initial: { scale: 1, rotate: 0 },
    hover: { scale: 1.1, rotate: 15 },
    tap: { scale: 0.95, rotate: -15 },
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 md:px-8 lg:px-12 py-2 sm:py-3 ${
          scrolled
            ? isDarkMode
              ? "bg-gradient-to-r from-gray-900/80 via-black/80 to-gray-900/80 backdrop-blur-md shadow-lg"
              : "bg-gradient-to-r from-gray-200/20 via-transparent to-gray-200/20 backdrop-blur-md shadow-lg"
            : isDarkMode
              ? "bg-gradient-to-r from-gray-900/50 via-transparent to-gray-900/50"
              : "bg-gradient-to-r from-gray-200/10 via-transparent to-gray-200/10"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to={ROUTES.HOME} className="flex items-center">
            <img
              src="/images/logo.svg"
              alt="BUDJU Coin Logo"
              className="navbar-logo h-10 sm:h-12 md:h-14 w-auto transition-all duration-300"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden xl:flex items-center space-x-6">
            {mainNavItems.map((item) =>
              item.path.startsWith("http") ? (
                <a
                  key={item.path}
                  href={item.path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`relative font-semibold text-sm md:text-base lg:text-lg transform transition duration-300 cursor-pointer flex items-center space-x-2 ${
                    isDarkMode
                      ? "text-gray-300/50 hover:text-budju-pink"
                      : "text-white/50 hover:text-black"
                  } hover:scale-105`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                </a>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative font-semibold text-sm md:text-base lg:text-lg transform transition duration-300 cursor-pointer flex items-center space-x-2 ${
                    location.pathname === item.path
                      ? isDarkMode
                        ? "text-budju-pink"
                        : "text-black"
                      : isDarkMode
                        ? "text-gray-300/50 hover:text-budju-pink"
                        : "text-white/50 hover:text-black"
                  } hover:scale-105`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.name}</span>
                  {location.pathname === item.path && (
                    <motion.div
                      layoutId="navbar-indicator"
                      className={`absolute -bottom-1 left-0 right-0 h-0.5 ${
                        isDarkMode ? "bg-budju-pink" : "bg-black"
                      }`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                </Link>
              ),
            )}
            {/* More Dropdown */}
            <div className="relative">
              <button
                onClick={toggleDropdown}
                className={`font-semibold text-sm md:text-base lg:text-lg transform transition duration-300 cursor-pointer flex items-center space-x-2 ${
                  isDarkMode
                    ? "text-gray-300/50 hover:text-budju-pink"
                    : "text-white/50 hover:text-black"
                } hover:scale-105`}
              >
                <FaArrowDown className="w-4 h-4" />
                <span>More</span>
                <FaAngleDown
                  className={`w-3 h-3 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className={`absolute top-full left-0 mt-2 w-48 rounded-lg shadow-lg ${
                    isDarkMode ? "bg-gray-800" : "bg-white"
                  }`}
                >
                  {moreNavItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`block px-4 py-2 text-sm font-medium transition-colors ${
                        location.pathname === item.path
                          ? isDarkMode
                            ? "bg-gray-700 text-budju-pink"
                            : "bg-gray-200 text-black"
                          : isDarkMode
                            ? "text-gray-300/50 hover:bg-gray-700/30 hover:text-budju-pink"
                            : "text-gray-700/50 hover:bg-gray-200/30 hover:text-black"
                      }`}
                      onClick={() => setDropdownOpen(false)}
                    >
                      <div className="flex items-center space-x-2">
                        <item.icon className="w-3 h-3" />
                        <span>{item.name}</span>
                      </div>
                    </Link>
                  ))}
                </motion.div>
              )}
            </div>
          </div>

          <div className="hidden xl:flex items-center space-x-4">
            <WalletConnect />
            <motion.button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer ${
                isDarkMode
                  ? "bg-gray-800 text-budju-pink hover:bg-gray-700"
                  : "bg-gray-200 text-purple-600 hover:bg-gray-300"
              } hover:shadow-[0_0_15px_rgba(255,105,180,0.5)]`}
              variants={buttonVariants}
              initial="initial"
              whileHover="hover"
              whileTap="tap"
              animate={{
                rotate: isDarkMode ? 360 : 0,
                transition: { duration: 0.5 },
              }}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <FaSun size={18} /> : <FaMoon size={18} />}
            </motion.button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="xl:hidden flex items-center space-x-2">
            <WalletConnect size="sm" />
            <motion.button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer ${
                isDarkMode
                  ? "bg-gray-800 text-budju-pink hover:bg-gray-700"
                  : "bg-gray-200 text-purple-600 hover:bg-gray-300"
              } hover:shadow-[0_0_15px_rgba(255,105,180,0.5)]`}
              variants={buttonVariants}
              initial="initial"
              whileHover="hover"
              whileTap="tap"
              animate={{
                rotate: isDarkMode ? 360 : 0,
                transition: { duration: 0.5 },
              }}
              aria-label="Toggle theme"
            >
              {isDarkMode ? <FaSun size={16} /> : <FaMoon size={16} />}
            </motion.button>
            <button
              onClick={toggleMenu}
              className={`p-2 rounded-full transition-colors cursor-pointer ${
                isDarkMode
                  ? "bg-gray-800 hover:bg-gray-700"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
              aria-label={isOpen ? "Close menu" : "Open menu"}
            >
              {isOpen ? (
                <FaTimes size={20} className="text-budju-pink" />
              ) : (
                <FaBars
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`fixed inset-0 ${isDarkMode ? "bg-gray-900/95" : "bg-gray-100/95"} z-[100] overflow-auto`}
            style={{ touchAction: "pan-y" }}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDarkMode
                  ? "border-gray-800 bg-gray-900/50"
                  : "border-gray-300 bg-gray-200/50"
              }`}
            >
              <Link to={ROUTES.HOME} onClick={toggleMenu}>
                <img
                  src="/images/logo.svg"
                  alt="BUDJU Coin Logo"
                  className="h-10 w-auto"
                />
              </Link>
              <button
                onClick={toggleMenu}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  isDarkMode
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
                aria-label="Close menu"
              >
                <FaTimes size={22} className="text-budju-pink" />
              </button>
            </motion.div>

            <div className="p-4 space-y-2">
              {mainNavItems.map((item, index) =>
                item.path.startsWith("http") ? (
                  <motion.div
                    key={item.path}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
                  >
                    <a
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block py-3 px-4 font-medium rounded-lg transition-colors cursor-pointer flex items-center space-x-2 ${
                        isDarkMode
                          ? "text-gray-200/50 hover:bg-gray-800/30 hover:text-budju-pink"
                          : "text-gray-700/50 hover:bg-gray-300/30 hover:text-budju-pink"
                      }`}
                      onClick={toggleMenu}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </a>
                  </motion.div>
                ) : (
                  <motion.div
                    key={item.path}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 + index * 0.05, duration: 0.3 }}
                  >
                    <Link
                      to={item.path}
                      className={`block py-3 px-4 font-medium rounded-lg transition-colors cursor-pointer flex items-center space-x-2 ${
                        location.pathname === item.path
                          ? isDarkMode
                            ? "bg-gray-800/30 text-budju-pink"
                            : "bg-gray-300/30 text-budju-pink"
                          : isDarkMode
                            ? "text-gray-200/50 hover:bg-gray-800/30 hover:text-budju-pink"
                            : "text-gray-700/50 hover:bg-gray-300/30 hover:text-budju-pink"
                      }`}
                      onClick={toggleMenu}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
                  </motion.div>
                ),
              )}
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{
                  delay: 0.2 + mainNavItems.length * 0.05,
                  duration: 0.3,
                }}
              >
                <div
                  className={`py-3 px-4 font-medium rounded-lg ${
                    isDarkMode ? "text-gray-200/50" : "text-gray-700/50"
                  } flex items-center space-x-2`}
                >
                  <FaArrowDown className="w-5 h-5" />
                  <span>More</span>
                </div>
                <div className="pl-8 space-y-2">
                  {moreNavItems.map((item, index) => (
                    <motion.div
                      key={item.path}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{
                        delay: 0.2 + (mainNavItems.length + index + 1) * 0.05,
                        duration: 0.3,
                      }}
                    >
                      <Link
                        to={item.path}
                        className={`block py-3 px-4 font-medium rounded-lg transition-colors cursor-pointer flex items-center space-x-2 ${
                          location.pathname === item.path
                            ? isDarkMode
                              ? "bg-gray-800/30 text-budju-pink"
                              : "bg-gray-300/30 text-budju-pink"
                            : isDarkMode
                              ? "text-gray-200/50 hover:bg-gray-800/30 hover:text-budju-pink"
                              : "text-gray-700/50 hover:bg-gray-300/30 hover:text-budju-pink"
                        }`}
                        onClick={toggleMenu}
                      >
                        <item.icon className="w-5 h-5" />
                        <span>{item.name}</span>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="px-4 py-4"
            >
              <WalletConnect fullWidth size="lg" />
            </motion.div> */}

            <BudjuParadeBanner />

            {/* <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.3 }}
              className={`absolute bottom-0 left-0 right-0 py-4 border-t ${
                isDarkMode
                  ? "border-gray-800 bg-gray-900/50"
                  : "border-gray-300 bg-gray-200/50"
              }`}
            >
              <div className="overflow-hidden whitespace-nowrap">
                <div
                  className={`animate-[marquee_25s_linear_infinite] text-sm ${
                    isDarkMode ? "text-gray-300/50" : "text-gray-700/50"
                  }`}
                >
                  * JOIN THE BUDJU PARADE * JOIN THE BUDJU PARADE * JOIN THE
                  BUDJU PARADE *
                </div>
              </div>
            </motion.div> */}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
