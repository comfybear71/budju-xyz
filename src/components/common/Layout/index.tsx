import { ReactNode, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation } from "react-router";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { pageTransition } from "@/lib/utils/animation";

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
    <div className="flex flex-col min-h-screen bg-budju-black text-white">
      <Navbar />

      <AnimatePresence mode="wait">
        <motion.main
          key={pathname}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={pageTransition}
          className="flex-grow pt-24" // Account for fixed navbar
        >
          {children}
        </motion.main>
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default Layout;
