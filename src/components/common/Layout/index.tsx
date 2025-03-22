import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "react-router";
import Navbar from "./Navbar";
import Footer from "./Footer";

import { pageTransition } from "@/lib/utils/animation";
import Web3Background from "../Web3Background";

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const { pathname } = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Web3Background>
      <div className="flex flex-col min-h-screen relative z-10">
        <Navbar />

        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageTransition}
            className="flex-grow " // Account for fixed navbar
          >
            {children}
          </motion.main>
        </AnimatePresence>

        <Footer />
      </div>
    </Web3Background>
  );
};

export default Layout;
