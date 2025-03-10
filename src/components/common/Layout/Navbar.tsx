import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { FaBars, FaTimes, FaSun, FaMoon } from "react-icons/fa";
import { gsap } from "gsap";
import { useTheme } from "@/context/ThemeContext";
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
          <Link to="/" className="flex items-center">
            <img
              src="/images/logo.svg"
              alt="BUDJU Coin Logo"
              className="navbar-logo h-10 sm:h-12 md:h-14 w-auto transition-all duration-300"
            />
          </Link>

          <div className="hidden xl:flex items-center space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`relative font-semibold text-sm md:text-base lg:text-lg transform transition duration-300 cursor-pointer
        ${
          location.pathname === item.path
            ? isDarkMode
              ? "text-budju-pink"
              : "text-black"
            : isDarkMode
              ? "text-gray-300 hover:text-budju-pink" // Dark mode: default gray-300, hover budju-pink
              : "text-white hover:text-black"
        } hover:scale-105`}
              >
                {item.name}
                {location.pathname === item.path && (
                  <motion.div
                    layoutId="navbar-indicator"
                    className={`absolute -bottom-1 left-0 right-0 h-0.5 ${
                      isDarkMode ? "bg-budju-pink" : "bg-black" // Light mode: indikator hitam, Dark mode: indikator budju-pink
                    }`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </Link>
            ))}
          </div>

          <div className="hidden xl:flex items-center space-x-4">
            <WalletConnect />
            <a
              href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm md:text-base px-4 py-2 rounded-full bg-gradient-to-r ${
                isDarkMode
                  ? "from-budju-pink to-purple-600 hover:from-purple-600 hover:to-budju-pink"
                  : "from-budju-pink to-purple-400 hover:from-purple-400 hover:to-budju-pink"
              } text-white transition-all shadow-md hover:shadow-lg cursor-pointer`}
            >
              BUY BUDJU
            </a>
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
              {isDarkMode ? <FaSun size={20} /> : <FaMoon size={20} />}
            </motion.button>
          </div>

          <div className="xl:hidden flex items-center space-x-2">
            <a
              href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r ${
                isDarkMode
                  ? "from-budju-pink to-purple-600 hover:from-purple-600 hover:to-budju-pink"
                  : "from-budju-pink to-purple-400 hover:from-purple-400 hover:to-budju-pink"
              } text-white transition-all shadow-md hover:shadow-lg cursor-pointer`}
            >
              BUY BUDJU
            </a>
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
                <FaTimes size={22} className="text-budju-pink" />
              ) : (
                <FaBars
                  size={22}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              )}
            </button>
          </div>
        </div>
      </nav>

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
              <img
                src="/images/logo.svg"
                alt="BUDJU Coin Logo"
                className="h-10 w-auto"
              />
              <button
                onClick={toggleMenu}
                className={`p-2 rounded-full transition-colors cursor-pointer ${
                  isDarkMode
                    ? "bg-gray-800 hover:bg-gray-700"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
                aria-label="Close menu"
              >
                <FaTimes size={24} className="text-budju-pink" />
              </button>
            </motion.div>

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
                    className={`block py-3 px-4 font-medium rounded-lg transition-colors cursor-pointer ${
                      location.pathname === item.path
                        ? isDarkMode
                          ? "bg-gray-800/50 text-budju-pink"
                          : "bg-gray-300/50 text-budju-pink"
                        : isDarkMode
                          ? "text-gray-200 hover:bg-gray-800/50 hover:text-budju-pink"
                          : "text-gray-700 hover:bg-gray-300/50 hover:text-budju-pink"
                    }`}
                    onClick={toggleMenu}
                  >
                    {item.name}
                  </Link>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.3 }}
              className="px-4 py-4"
            >
              <WalletConnect fullWidth size="lg" />
            </motion.div>

            <motion.div
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
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
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
