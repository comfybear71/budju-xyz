// App config
export const APP_NAME = "BUDJU";
export const APP_DESCRIPTION =
  "The BUDJU Trading Bot — Automated DeFi on Solana";
export const APP_URL =
  import.meta.env.VITE_PUBLIC_URL || "https://budjucoin.com";

// Social media links
export const SOCIAL_LINKS = [
  {
    name: "Facebook",
    icon: "facebook",
    url: "https://www.facebook.com/share/g/167RuPUSM1/?mibextid=wwXIfr",
  },
  {
    name: "Telegram",
    icon: "telegram",
    url: "http://t.me/budjucoingroup",
  },
  {
    name: "Instagram",
    icon: "instagram",
    url: "https://www.instagram.com/budjucoin?igsh=YnV5N2x0M2Q4OG1i&utm_source=qr",
  },
  {
    name: "Twitter",
    icon: "twitter",
    url: "https://x.com/budjucoin?s=21",
  },
  {
    name: "TikTok",
    icon: "tiktok",
    url: "https://www.tiktok.com/@budjucoin",
  },
  {
    name: "Pump.fun",
    icon: "pills",
    url: "https://pump.fun/coin/2ajYe8eh8btUZRpaZ1v7ewWDkcYJmVGvPuDTU5xrpump?coins_sort=market_cap",
  },
];

// Analytics
export const ANALYTICS_ID = import.meta.env.VITE_ANALYTICS_ID;

// Feature flags
export const FEATURES = {
  NFT_MINTING: import.meta.env.VITE_FEATURE_NFT_MINTING === "true",
  BANK_STAKING: import.meta.env.VITE_FEATURE_BANK_STAKING === "true",
  SHOP: import.meta.env.VITE_FEATURE_SHOP === "true",
};

// Token info
export const TOKEN_INFO = {
  TOTAL_SUPPLY: 1_000_000_000,
  SYMBOL: "BUDJU",
  DECIMALS: 6,
  FIRST_CREATED: "January 31, 2025",
};

// Roadmap phases
export const ROADMAP_PHASES = [
  {
    title: "PHASE 1",
    items: [
      { text: "Create Budju Coin", completed: true },
      { text: "50 budju wallet holders", completed: true },
      { text: "10K Market Cap", completed: true },
      { text: "Created Bank of Budju", completed: true },
      { text: "Burning BUDJU GO!", completed: true },
      { text: "Mint NFT's > 1000 holders", completed: false },
      { text: "Reach Pump.fun milestones", completed: true },
      { text: "bonding curve : 100%", completed: true },
      { text: "👑king of the hill : 100%", completed: true },
      { text: "100 budju wallet holders", completed: true },
      { text: "Marketing Campaign", completed: false },
    ],
  },
  {
    title: "PHASE 2",
    items: [
      { text: "bonding curve : 100%", completed: true },
      { text: "500 Wallet Holders", completed: false },
      { text: "2nd generation NFTs", completed: false },
      { text: "100K Market Cap", completed: true },
      { text: "Listed on Raydium", completed: true },
      { text: "SHOP of BUDJU's", completed: true },
      { text: "BANK of BUDJU's", completed: true },
    ],
  },
  {
    title: "PHASE 3",
    items: [
      { text: "Merchandise", completed: false },
      { text: "More promotional Marketing", completed: false },
      { text: "1 Million Dollar Market Cap", completed: false },
      { text: "1000 Wallet Holders", completed: false },
    ],
  },
  {
    title: "PHASE 4",
    items: [
      { text: "Villa of BUDJU's", completed: false },
      { text: "Competitions / Give aways", completed: false },
      { text: 'Global Branding of "Budju"', completed: false },
      { text: "10 Million Market Cap", completed: false },
      { text: "10,000 wallet holders", completed: false },
      { text: "L1 / L2 Exchanges", completed: false },
    ],
  },
];
