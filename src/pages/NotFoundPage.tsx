import { memo } from "react";
import { Link } from "react-router";
import { motion } from "framer-motion";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Head from "../components/common/Head";
import Button from "../components/common/Button";
import logoImage from "../assets/images/logo.png";
import budjuImage from "../assets/images/budju.png";

const NotFoundPage = () => {
  return (
    <>
      <Head
        title="Page Not Found | BUDJU COIN"
        description="Oops! The page you're looking for doesn't exist."
      />

      <div className="flex flex-col min-h-screen bg-black text-white">
        <Navbar
          logoSrc={logoImage}
          buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
        />

        <main className="flex-grow flex items-center justify-center pt-20 px-4">
          <div className="text-center">
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.6 }}
            >
              <img
                src={budjuImage}
                alt="Budju Character"
                className="w-40 h-40 mx-auto"
              />
            </motion.div>

            <motion.h1
              className="mb-4 text-4xl font-bold"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              <span className="text-light-blue">404</span> - Page Not Found
            </motion.h1>

            <motion.p
              className="mb-8 text-xl text-gray-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              Oops! The page you're looking for has gone on a parade without us.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
            >
              <Link to="/">
                <Button variant="hot-pink" size="lg">
                  Back to Homepage
                </Button>
              </Link>
            </motion.div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default memo(NotFoundPage);
