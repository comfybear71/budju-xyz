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
  FaChartLine,
  FaSun,
  FaMoon,
  FaBahai,
  FaQuestion,
  FaFire,
  FaBullhorn,
} from "react-icons/fa";
import { gsap } from "gsap";
import { useTheme } from "@/context/ThemeContext";
import WalletConnect from "../WalletConnect";
import { ROUTES, ROUTE_NAMES } from "@/constants/routes";

interface IconComponentProps {
  className?: string;
}

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<IconComponentProps>;
}

const allNavItems: NavItem[] = [
  { name: ROUTE_NAMES[ROUTES.SWAP], path: ROUTES.SWAP, icon: FaExchangeAlt },
  { name: ROUTE_NAMES[ROUTES.POOL], path: ROUTES.POOL, icon: FaSwimmingPool },
  { name: ROUTE_NAMES[ROUTES.BANK], path: ROUTES.BANK, icon: FaPiggyBank },
  { name: ROUTE_NAMES[ROUTES.TOKENOMICS], path: ROUTES.TOKENOMICS, icon: FaChartBar },
  { name: ROUTE_NAMES[ROUTES.TRADE], path: ROUTES.TRADE, icon: FaChartLine },
  { name: ROUTE_NAMES[ROUTES.NFT], path: ROUTES.NFT, icon: FaBahai },
  { name: ROUTE_NAMES[ROUTES.BURN], path: ROUTES.BURN, icon: FaFire },
  { name: ROUTE_NAMES[ROUTES.SHOP], path: "https://shop-of-budjus.myspreadshop.com.au", icon: FaShoppingCart },
  { name: ROUTE_NAMES[ROUTES.HOW_TO_BUY], path: ROUTES.HOW_TO_BUY, icon: FaQuestion },
  { name: ROUTE_NAMES[ROUTES.MARKETING], path: ROUTES.MARKETING, icon: FaBullhorn },
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

  const renderNavLink = (item: NavItem) => {
    const isActive = location.pathname === item.path;
    const isExternal = item.path.startsWith("http");

    const linkClasses = `relative font-semibold text-sm transform transition duration-300 cursor-pointer flex items-center gap-1.5 ${
      isActive
        ? "text-budju-pink"
        : isDarkMode
          ? "text-gray-400 hover:text-budju-pink"
          : "text-white/70 hover:text-white"
    } hover:scale-105`;

    if (isExternal) {
      return (
        <a
          key={item.path}
          href={item.path}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClasses}
        >
          <item.icon className="w-3.5 h-3.5" />
          <span>{item.name}</span>
        </a>
      );
    }

    return (
      <Link key={item.path} to={item.path} className={linkClasses}>
        <item.icon className="w-3.5 h-3.5" />
        <span>{item.name}</span>
        {isActive && (
          <motion.div
            layoutId="navbar-indicator"
            className="absolute -bottom-1 left-0 right-0 h-0.5 bg-budju-pink"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </Link>
    );
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 sm:px-6 md:px-8 lg:px-10 py-2 sm:py-3 ${
          scrolled
            ? isDarkMode
              ? "bg-[#08081a]/80 backdrop-blur-xl border-b border-white/5 shadow-lg shadow-black/20"
              : "bg-white/60 backdrop-blur-xl border-b border-gray-200/50 shadow-lg shadow-gray-200/20"
            : isDarkMode
              ? "bg-transparent"
              : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <Link to={ROUTES.HOME} className="flex items-center flex-shrink-0">
            <img
              src="/images/logo.svg"
              alt="BUDJU Coin Logo"
              className="navbar-logo h-10 sm:h-12 w-auto transition-all duration-300"
            />
          </Link>

          {/* Desktop Navigation — All items visible */}
          <div className="hidden xl:flex items-center gap-5">
            {allNavItems.map((item) => renderNavLink(item))}
          </div>

          {/* Desktop Right Actions */}
          <div className="hidden xl:flex items-center gap-3">
            <WalletConnect />
            <motion.button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer ${
                isDarkMode
                  ? "bg-white/5 text-budju-pink hover:bg-white/10"
                  : "bg-gray-200 text-purple-600 hover:bg-gray-300"
              } hover:shadow-[0_0_15px_rgba(255,105,180,0.3)]`}
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
          </div>

          {/* Mobile Menu Toggle */}
          <div className="xl:hidden flex items-center gap-2">
            <WalletConnect size="sm" />
            <motion.button
              onClick={toggleTheme}
              className={`p-2 rounded-full transition-all duration-300 cursor-pointer ${
                isDarkMode
                  ? "bg-white/5 text-budju-pink hover:bg-white/10"
                  : "bg-gray-200 text-purple-600 hover:bg-gray-300"
              }`}
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
                  ? "bg-white/5 hover:bg-white/10"
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
            className={`fixed inset-0 z-[100] overflow-auto ${
              isDarkMode
                ? "bg-[#08081a]/98 backdrop-blur-xl"
                : "bg-white/98 backdrop-blur-xl"
            }`}
            style={{ touchAction: "pan-y" }}
          >
            {/* Mobile Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className={`flex items-center justify-between px-4 py-3 border-b ${
                isDarkMode ? "border-white/5" : "border-gray-200"
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
                    ? "bg-white/5 hover:bg-white/10"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
                aria-label="Close menu"
              >
                <FaTimes size={22} className="text-budju-pink" />
              </button>
            </motion.div>

            {/* Mobile Nav Items */}
            <div className="p-4 space-y-1">
              {allNavItems.map((item, index) => {
                const isActive = location.pathname === item.path;
                const isExternal = item.path.startsWith("http");

                const linkContent = (
                  <motion.div
                    key={item.path}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 + index * 0.05, duration: 0.3 }}
                  >
                    <div
                      className={`flex items-center gap-3 py-3.5 px-4 rounded-xl font-medium transition-colors ${
                        isActive
                          ? isDarkMode
                            ? "bg-budju-pink/10 text-budju-pink"
                            : "bg-budju-pink/10 text-budju-pink"
                          : isDarkMode
                            ? "text-gray-300 hover:bg-white/5 hover:text-budju-pink"
                            : "text-gray-700 hover:bg-gray-100 hover:text-budju-pink"
                      }`}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      <span>{item.name}</span>
                    </div>
                  </motion.div>
                );

                if (isExternal) {
                  return (
                    <a
                      key={item.path}
                      href={item.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={toggleMenu}
                    >
                      {linkContent}
                    </a>
                  );
                }

                return (
                  <Link key={item.path} to={item.path} onClick={toggleMenu}>
                    {linkContent}
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
