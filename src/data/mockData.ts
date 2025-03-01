import { BankData, Product, RoadmapPhase } from "@/types";

// Roadmap phases
export const roadmapPhases: RoadmapPhase[] = [
  {
    title: "PHASE 1",
    items: [
      { text: "Create Budju Coin", status: "completed" },
      { text: "50 budju wallet holders", status: "completed" },
      { text: "10K Market Cap", status: "completed" },
      { text: "Created Bank of Budju", status: "completed" },
      { text: "Burning BUDJU GO!", status: "completed" },
      { text: "Mint NFT's > 1000 holders", status: "inProgress" },
      { text: "Reach Pump.fun milestones", status: "completed" },
      { text: "bonding curve : 100%", status: "completed" },
      { text: "👑king of the hill : 100%", status: "completed" },
      { text: "100 budju wallet holders", status: "completed" },
      { text: "Marketing Campaign", status: "inProgress" },
      { text: "Seniman Bocah 🙏🙏🙏🙏", status: "inProgress" },
    ],
  },
  {
    title: "PHASE 2",
    items: [
      { text: "bonding curve : 100%", status: "completed" },
      { text: "500 Wallet Holders", status: "inProgress" },
      { text: "2nd generation NFTs", status: "pending" },
      { text: "100K Market Cap", status: "completed" },
      { text: "Listed on Raydium", status: "completed" },
      { text: "SHOP of BUDJU's", status: "completed" },
      { text: "BANK of BUDJU's", status: "completed" },
    ],
  },
  {
    title: "PHASE 3",
    items: [
      { text: "Merchandise", status: "inProgress" },
      { text: "More promotional Marketing", status: "pending" },
      { text: "1 Million Dollar Market Cap", status: "pending" },
      { text: "1000 Wallet Holders", status: "pending" },
    ],
  },
  {
    title: "PHASE 4",
    items: [
      { text: "Villa of BUDJU's", status: "inProgress" },
      { text: "Competitions / Give aways", status: "pending" },
      { text: 'Global Branding of "Budju"', status: "pending" },
      { text: "10 Million Market Cap", status: "pending" },
      { text: "10,000 wallet holders", status: "pending" },
      { text: "L1 / L2 Exchanges", status: "pending" },
    ],
  },
];

// Shop products
export const products: Product[] = [
  {
    id: "ladies-singlet-1",
    title: "SINGLET TOP OF BUDJU",
    category: "ladies",
    description: "Vibrant pink singlet—chic & bold",
    imageSrc: "/images/merch/ladies/singlets/pink-ladies-singlet-top.png",
    price: 29.99,
    url: "https://shop.budjucoin.com/product/ladies-singlet-1",
  },
  {
    id: "mens-singlet-1",
    title: "SINGLET TOP OF BUDJU",
    category: "mens",
    description: "Black logo pops—pink grit shines",
    imageSrc: "/images/merch/mens/singlets/black-logo-pink-bg-mens-singlet.jpg",
    price: 29.99,
    url: "https://shop.budjucoin.com/product/mens-singlet-1",
  },
  {
    id: "cap-1",
    title: "CAP OF BUDJU",
    category: "caps",
    description: "Pink cap pops—white logo strikes",
    imageSrc: "/images/merch/caps/pink-cap-white-logo.jpg",
    price: 24.99,
    url: "https://shop.budjucoin.com/product/cap-1",
  },
  {
    id: "cap-2",
    title: "CAP OF BUDJU",
    category: "caps",
    description: "White cap glows—pink logo rules",
    imageSrc: "/images/merch/caps/white-cap-pink-logo.jpg",
    price: 24.99,
    url: "https://shop.budjucoin.com/product/cap-2",
  },
  {
    id: "coffee-mug",
    title: "COFFEE MUG OF BUDJU",
    category: "special",
    description: "Mug stands tough—sip stays bold",
    imageSrc: "/images/merch/items/coffee-mug.jpg",
    price: 19.99,
    url: "https://shop.budjucoin.com/product/coffee-mug",
  },
];

// Bank data
export const bankData: BankData = {
  burnedTokens: 1569299,
  burnedAddress: "B1opJeR2emYp75spauVHkGXfyxkYSW7GZaN9B3XoUeGK",
  totalSupply: 998430701,
  bankAddress: "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc",
  tokensHeld: ["SOLANA", "BUDJU", "JITO STAKED SOL"],
  buyBackAmount: "$230.64 / 1,569,299 BUDJU",
  donationsAddress: "7grCp49j6SExSRud7YA5TdDSbWFyAJjLGif8Syr5CVpc",
  lastBurnDate: "26th FEB 2025",
};
