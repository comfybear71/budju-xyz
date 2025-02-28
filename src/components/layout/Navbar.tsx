import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router";

interface NavbarProps {
  logoSrc: string;
  buyLink: string;
}

const Navbar = ({ logoSrc, buyLink }: NavbarProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  return (
    <>
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-gradient-to-r from-black to-gray-900"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Link to="/" className="navbar-brand">
          <img src={logoSrc} alt="Budju Coin Logo" className="h-12" />
        </Link>
        <div className="flex items-center gap-4">
          <button
            className="text-3xl text-white md:hidden"
            onClick={toggleMenu}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <motion.a
            href={buyLink}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden px-6 py-2 text-white rounded-full bg-hot-pink md:inline-block hover:bg-opacity-80"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            BUY BUDJU
          </motion.a>
        </div>
      </motion.nav>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            id="menu"
            className="fixed inset-0 z-50 flex flex-col bg-black"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.3 }}
          >
            <div className="flex justify-end p-4">
              <button
                className="text-3xl text-white"
                onClick={toggleMenu}
                aria-label="Close menu"
              >
                ✖
              </button>
            </div>
            <div className="flex flex-col items-center justify-center flex-1">
              <ul className="space-y-6 text-center">
                <li>
                  <Link
                    to="/"
                    onClick={toggleMenu}
                    className="text-xl text-white hover:text-light-blue"
                  >
                    NFT MINTING
                  </Link>
                </li>
                <li>
                  <Link
                    to="/how-to-buy"
                    onClick={toggleMenu}
                    className="text-xl text-white hover:text-light-blue"
                  >
                    HOW TO BUY
                  </Link>
                </li>
                <li>
                  <Link
                    to="/tokenomics"
                    onClick={toggleMenu}
                    className="text-xl text-white hover:text-light-blue"
                  >
                    TOKENOMICS
                  </Link>
                </li>
                <li>
                  <Link
                    to="/join-us"
                    onClick={toggleMenu}
                    className="text-xl text-white hover:text-light-blue"
                  >
                    JOIN US
                  </Link>
                </li>
                <li>
                  <a
                    href="https://shop.budjucoin.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xl text-white hover:text-light-blue"
                  >
                    SHOP OF BUDJU's
                  </a>
                </li>
              </ul>
            </div>
            <div className="p-4 overflow-hidden text-white whitespace-nowrap">
              <div className="inline-block animate-marquee">
                * JOIN THE BUDJU PARADE * ... * JOIN THE BUDJU PARADE *
              </div>
            </div>
            <footer className="p-4">
              <div className="flex justify-center gap-4">
                <a
                  href="https://www.facebook.com/budjucoin"
                  className="text-white text-2xl hover:text-light-blue"
                >
                  <i className="fab fa-facebook"></i>
                </a>
                <a
                  href="http://t.me/budjucoingroup"
                  className="text-white text-2xl hover:text-light-blue"
                >
                  <i className="fab fa-telegram-plane"></i>
                </a>
                <a
                  href="https://www.instagram.com/budjucoin"
                  className="text-white text-2xl hover:text-light-blue"
                >
                  <i className="fab fa-instagram"></i>
                </a>
                <a
                  href="https://x.com/budjucoin"
                  className="text-white text-2xl hover:text-light-blue"
                >
                  <i className="fa-brands fa-x-twitter"></i>
                </a>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default memo(Navbar);
