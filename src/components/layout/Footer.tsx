import { memo } from "react";
import { motion } from "framer-motion";

const socialLinks = [
  { icon: "fab fa-facebook", url: "https://www.facebook.com/budjucoin" },
  { icon: "fab fa-telegram-plane", url: "http://t.me/budjucoingroup" },
  { icon: "fab fa-instagram", url: "https://www.instagram.com/budjucoin" },
  { icon: "fa-brands fa-x-twitter", url: "https://x.com/budjucoin" },
  {
    icon: "fa-solid fa-pills",
    url: "https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump",
  },
  { icon: "fa-brands fa-tiktok", url: "https://www.tiktok.com/@budjucoin" },
];

const Footer = () => {
  return (
    <footer className="py-8 mt-12 bg-black">
      <div className="container px-4 mx-auto">
        <div className="flex flex-wrap items-center justify-center">
          <div className="flex flex-wrap justify-center w-full gap-6">
            {socialLinks.map((link, index) => (
              <motion.a
                key={index}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-12 h-12 text-2xl text-white transition-colors rounded-full bg-budju-gray hover:text-light-blue"
                whileHover={{ scale: 1.1, backgroundColor: "#1e1e1e" }}
                whileTap={{ scale: 0.95 }}
              >
                <i className={link.icon}></i>
              </motion.a>
            ))}
          </div>

          <div className="w-full mt-8 text-center">
            <motion.p
              className="text-sm text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              © {new Date().getFullYear()} BUDJU COIN. All rights reserved.
            </motion.p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(Footer);
