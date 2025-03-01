import { memo } from "react";
import { motion } from "framer-motion";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import Head from "../components/common/Head";
import SectionTitle from "../components/common/SectionTitle";
import Button from "../components/common/Button";
import logoImage from "../assets/images/logo.png";

interface SocialLink {
  name: string;
  icon: string;
  url: string;
  color: string;
}

const socialLinks: SocialLink[] = [
  {
    name: "Facebook",
    icon: "fab fa-facebook",
    url: "https://www.facebook.com/budjucoin",
    color: "bg-blue-600",
  },
  {
    name: "Telegram",
    icon: "fab fa-telegram-plane",
    url: "http://t.me/budjucoingroup",
    color: "bg-sky-500",
  },
  {
    name: "Instagram",
    icon: "fab fa-instagram",
    url: "https://www.instagram.com/budjucoin",
    color: "bg-gradient-to-r from-purple-500 via-pink-500 to-red-500",
  },
  {
    name: "X / Twitter",
    icon: "fa-brands fa-x-twitter",
    url: "https://x.com/budjucoin",
    color: "bg-black border border-gray-600",
  },
  {
    name: "Pump.fun",
    icon: "fa-solid fa-pills",
    url: "https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
    color: "bg-indigo-600",
  },
  {
    name: "TikTok",
    icon: "fa-brands fa-tiktok",
    url: "https://www.tiktok.com/@budjucoin",
    color: "bg-black border border-gray-600",
  },
];

const JoinUsPage = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: "easeOut",
      },
    },
  };

  return (
    <>
      <Head
        title="Join The BUDJU Community"
        description="Join the vibrant BUDJU COIN community across social media platforms. Be part of the Budju Parade!"
      />

      <div className="flex flex-col min-h-screen bg-black text-white">
        <Navbar
          logoSrc={logoImage}
          buyLink="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
        />

        <main className="flex-grow pt-20">
          <section className="py-16">
            <div className="container px-4 mx-auto">
              <SectionTitle whiteText="Join" blueText="The Community" />

              <motion.div
                className="max-w-3xl mx-auto mb-12 text-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <p className="text-xl text-gray-300">
                  Become part of the Budju movement! Connect with us across
                  social platforms, join discussions, and be the first to know
                  about upcoming launches, events, and opportunities.
                </p>
              </motion.div>

              <motion.div
                className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {socialLinks.map((link, index) => (
                  <motion.a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-4 p-6 transition-transform ${link.color} rounded-lg hover:scale-105`}
                    variants={itemVariants}
                  >
                    <span className="flex items-center justify-center w-12 h-12 text-2xl text-white bg-white bg-opacity-20 rounded-full">
                      <i className={link.icon}></i>
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-white">
                        {link.name}
                      </h3>
                      <p className="text-white text-opacity-80">@budjucoin</p>
                    </div>
                  </motion.a>
                ))}
              </motion.div>

              <motion.div
                className="flex flex-col items-center max-w-md mx-auto mt-16"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.5 }}
              >
                <h3 className="mb-6 text-2xl font-bold text-center">
                  <span className="text-light-blue">Ready to</span>{" "}
                  <span className="text-white">join the parade?</span>
                </h3>

                <Button
                  variant="hot-pink"
                  size="lg"
                  href="https://ape.pro/solana/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump"
                  external
                >
                  BUY BUDJU NOW
                </Button>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default memo(JoinUsPage);
