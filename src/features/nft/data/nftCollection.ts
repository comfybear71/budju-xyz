// ============================================================
// BUDJU NFT Collection — 30 unique NFTs
// ============================================================
// Rarity: Common (10) · Uncommon (8) · Rare (5) · Epic (4) · Legendary (2) · Golden (1)
// Payment accepted: BUDJU · USDC · SOL
// All proceeds → Bank of BUDJU treasury
// ============================================================

export type Rarity =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "Epic"
  | "Legendary"
  | "Golden";

export interface NFTTrait {
  category: string;
  value: string;
}

export interface BudjuNFT {
  id: number;
  name: string;
  image: string;
  description: string;
  rarity: Rarity;
  price: number; // in USD equivalent
  traits: NFTTrait[];
  edition: string; // e.g. "1 of 1", "1 of 5"
  likes: number;
  listed: boolean; // available for purchase
  owner: string | null; // wallet address or null if available
}

// ── Rarity config ──────────────────────────────────────────
export const RARITY_CONFIG: Record<
  Rarity,
  { color: string; bg: string; border: string; glow: string; label: string }
> = {
  Common: {
    color: "text-gray-400",
    bg: "bg-gray-500/20",
    border: "border-gray-500/40",
    glow: "",
    label: "Common",
  },
  Uncommon: {
    color: "text-green-400",
    bg: "bg-green-500/20",
    border: "border-green-500/40",
    glow: "",
    label: "Uncommon",
  },
  Rare: {
    color: "text-blue-400",
    bg: "bg-blue-500/20",
    border: "border-blue-500/40",
    glow: "shadow-blue-500/20",
    label: "Rare",
  },
  Epic: {
    color: "text-purple-400",
    bg: "bg-purple-500/20",
    border: "border-purple-500/40",
    glow: "shadow-purple-500/20",
    label: "Epic",
  },
  Legendary: {
    color: "text-amber-400",
    bg: "bg-amber-500/20",
    border: "border-amber-500/40",
    glow: "shadow-amber-500/30",
    label: "Legendary",
  },
  Golden: {
    color: "text-yellow-300",
    bg: "bg-gradient-to-br from-yellow-500/30 to-amber-600/30",
    border: "border-yellow-400/60",
    glow: "shadow-yellow-400/40",
    label: "Golden",
  },
};

// Price tiers by rarity (USD)
export const RARITY_PRICES: Record<Rarity, number> = {
  Common: 50,
  Uncommon: 100,
  Rare: 200,
  Epic: 400,
  Legendary: 750,
  Golden: 2500,
};

// ── The 30-piece collection ────────────────────────────────
export const NFT_COLLECTION: BudjuNFT[] = [
  // ─── GOLDEN (1) ───
  {
    id: 1,
    name: "BUDJU Queen — The Golden One",
    image: "/images/budju06.png",
    description:
      "The rarest NFT in the entire BUDJU universe. The Golden Queen radiates pure opulence — a shimmering aura of gold, diamond accessories, and a crown that signifies ultimate status. Only one exists. Own it and you own BUDJU royalty.",
    rarity: "Golden",
    price: 2500,
    traits: [
      { category: "Background", value: "Pure Gold Radiance" },
      { category: "Outfit", value: "Diamond-Encrusted Gown" },
      { category: "Accessory", value: "Royal Crown" },
      { category: "Expression", value: "Regal Confidence" },
      { category: "Aura", value: "Golden Shimmer" },
      { category: "Special", value: "1 of 1 — Unique" },
    ],
    edition: "1 of 1",
    likes: 0,
    listed: true,
    owner: null,
  },

  // ─── LEGENDARY (2) ───
  {
    id: 2,
    name: "BUDJU Goddess — Celestial",
    image: "/images/budju05.png",
    description:
      "Floating among the stars, the Celestial Goddess channels the cosmic energy of the BUDJU universe. Her ethereal glow and star-studded aura make her one of the most coveted pieces in the collection.",
    rarity: "Legendary",
    price: 750,
    traits: [
      { category: "Background", value: "Cosmic Nebula" },
      { category: "Outfit", value: "Starlight Dress" },
      { category: "Accessory", value: "Star Pendant" },
      { category: "Expression", value: "Mysterious" },
      { category: "Aura", value: "Celestial Glow" },
    ],
    edition: "1 of 2",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 3,
    name: "BUDJU Empress — Phoenix",
    image: "/images/budju03.png",
    description:
      "Born from the flames of determination, the Phoenix Empress rises with fiery wings and an unstoppable spirit. She represents the resilient heart of the BUDJU community.",
    rarity: "Legendary",
    price: 750,
    traits: [
      { category: "Background", value: "Flame Horizon" },
      { category: "Outfit", value: "Phoenix Armor" },
      { category: "Accessory", value: "Fire Wings" },
      { category: "Expression", value: "Fierce" },
      { category: "Aura", value: "Ember Trail" },
    ],
    edition: "2 of 2",
    likes: 0,
    listed: true,
    owner: null,
  },

  // ─── EPIC (4) ───
  {
    id: 4,
    name: "BUDJU Neon — Cyberpunk",
    image: "/images/budju04.png",
    description:
      "Straight out of a neon-lit future, the Cyberpunk BUDJU commands the digital underground with her LED visor and holographic jacket.",
    rarity: "Epic",
    price: 400,
    traits: [
      { category: "Background", value: "Neon Cityscape" },
      { category: "Outfit", value: "Holographic Jacket" },
      { category: "Accessory", value: "LED Visor" },
      { category: "Expression", value: "Determined" },
    ],
    edition: "1 of 4",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 5,
    name: "BUDJU Mystic — Enchantress",
    image: "/images/budju02.png",
    description:
      "The Enchantress weaves spells of fortune and luck. Her crystal staff and flowing robes hint at ancient blockchain magic passed down through generations.",
    rarity: "Epic",
    price: 400,
    traits: [
      { category: "Background", value: "Mystic Forest" },
      { category: "Outfit", value: "Enchanted Robes" },
      { category: "Accessory", value: "Crystal Staff" },
      { category: "Expression", value: "Enigmatic" },
    ],
    edition: "2 of 4",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 6,
    name: "BUDJU Storm — Thunder Queen",
    image: "/images/budju01.png",
    description:
      "Commanding the skies with electrifying presence, the Thunder Queen brings the storm. Her lightning crown crackles with raw power.",
    rarity: "Epic",
    price: 400,
    traits: [
      { category: "Background", value: "Storm Clouds" },
      { category: "Outfit", value: "Thunder Armor" },
      { category: "Accessory", value: "Lightning Crown" },
      { category: "Expression", value: "Powerful" },
    ],
    edition: "3 of 4",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 7,
    name: "BUDJU Ocean — Deep Blue",
    image: "/images/budju00.png",
    description:
      "From the depths of the digital ocean, Deep Blue surfaces with coral accessories and bioluminescent hair. She guards the treasures of the deep.",
    rarity: "Epic",
    price: 400,
    traits: [
      { category: "Background", value: "Ocean Depths" },
      { category: "Outfit", value: "Coral Armor" },
      { category: "Accessory", value: "Trident" },
      { category: "Expression", value: "Serene" },
    ],
    edition: "4 of 4",
    likes: 0,
    listed: true,
    owner: null,
  },

  // ─── RARE (5) ───
  {
    id: 8,
    name: "BUDJU Sakura — Cherry Blossom",
    image: "/images/budju02.png",
    description:
      "Delicate petals swirl around the Cherry Blossom BUDJU as she dances through a Japanese garden at sunset. Grace meets crypto culture.",
    rarity: "Rare",
    price: 200,
    traits: [
      { category: "Background", value: "Cherry Blossom Garden" },
      { category: "Outfit", value: "Silk Kimono" },
      { category: "Accessory", value: "Blossom Hairpin" },
      { category: "Expression", value: "Graceful" },
    ],
    edition: "1 of 5",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 9,
    name: "BUDJU Arctic — Ice Princess",
    image: "/images/budju04.png",
    description:
      "Carved from glacial ice and wrapped in frost, the Ice Princess glitters under the aurora borealis. Cool, composed, and impossibly rare.",
    rarity: "Rare",
    price: 200,
    traits: [
      { category: "Background", value: "Aurora Borealis" },
      { category: "Outfit", value: "Frost Gown" },
      { category: "Accessory", value: "Ice Tiara" },
      { category: "Expression", value: "Cool" },
    ],
    edition: "2 of 5",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 10,
    name: "BUDJU Punk — Rebel Queen",
    image: "/images/budju01.png",
    description:
      "Spray paint, leather, and attitude. The Rebel Queen breaks all the rules and looks incredible doing it. The underground scene's favorite BUDJU.",
    rarity: "Rare",
    price: 200,
    traits: [
      { category: "Background", value: "Graffiti Alley" },
      { category: "Outfit", value: "Leather & Chains" },
      { category: "Accessory", value: "Spray Can" },
      { category: "Expression", value: "Defiant" },
    ],
    edition: "3 of 5",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 11,
    name: "BUDJU Galaxy — Stardust",
    image: "/images/budju05.png",
    description:
      "Woven from stardust and cosmic threads, this BUDJU carries the galaxy on her shoulders. Her constellation patterns tell the story of BUDJU's rise.",
    rarity: "Rare",
    price: 200,
    traits: [
      { category: "Background", value: "Milky Way" },
      { category: "Outfit", value: "Constellation Dress" },
      { category: "Accessory", value: "Star Map" },
      { category: "Expression", value: "Dreamy" },
    ],
    edition: "4 of 5",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 12,
    name: "BUDJU Jungle — Wild Heart",
    image: "/images/budju03.png",
    description:
      "Deep in the crypto jungle, the Wild Heart roams free with her tiger companion. Untamed, fearless, and totally BUDJU.",
    rarity: "Rare",
    price: 200,
    traits: [
      { category: "Background", value: "Tropical Jungle" },
      { category: "Outfit", value: "Safari Chic" },
      { category: "Accessory", value: "Vine Crown" },
      { category: "Expression", value: "Wild" },
    ],
    edition: "5 of 5",
    likes: 0,
    listed: true,
    owner: null,
  },

  // ─── UNCOMMON (8) ───
  {
    id: 13,
    name: "BUDJU Beach — Island Vibes",
    image: "/images/budju00.png",
    description:
      "Sun-kissed and carefree, Island Vibes BUDJU brings Bali energy to the blockchain. Flip flops, coconut drink, and zero worries.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Tropical Sunset" },
      { category: "Outfit", value: "Beach Sarong" },
      { category: "Accessory", value: "Coconut Drink" },
      { category: "Expression", value: "Chill" },
    ],
    edition: "1 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 14,
    name: "BUDJU Party — Club Queen",
    image: "/images/budju01.png",
    description:
      "The life of every party, Club Queen lights up the dance floor with her sparkly outfit and infectious energy. Luna Beach Club is calling!",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Club Lights" },
      { category: "Outfit", value: "Sparkle Dress" },
      { category: "Accessory", value: "Glow Sticks" },
      { category: "Expression", value: "Dancing" },
    ],
    edition: "2 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 15,
    name: "BUDJU Gamer — Player One",
    image: "/images/budju04.png",
    description:
      "Controller in hand and headset on, Player One is ready to dominate. She streams, she games, and she always wins.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Gaming Setup" },
      { category: "Outfit", value: "Esports Jersey" },
      { category: "Accessory", value: "RGB Headset" },
      { category: "Expression", value: "Focused" },
    ],
    edition: "3 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 16,
    name: "BUDJU Retro — Vintage Vibes",
    image: "/images/budju02.png",
    description:
      "Throwback to the 80s with neon colors, big hair, and roller skates. Vintage Vibes brings nostalgia to the future of finance.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Retro Arcade" },
      { category: "Outfit", value: "Neon Tracksuit" },
      { category: "Accessory", value: "Roller Skates" },
      { category: "Expression", value: "Playful" },
    ],
    edition: "4 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 17,
    name: "BUDJU Astro — Moonwalker",
    image: "/images/budju03.png",
    description:
      "One small step for BUDJU, one giant leap for the community. Moonwalker explores the lunar surface in her custom spacesuit.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Lunar Surface" },
      { category: "Outfit", value: "BUDJU Spacesuit" },
      { category: "Accessory", value: "Helmet" },
      { category: "Expression", value: "Adventurous" },
    ],
    edition: "5 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 18,
    name: "BUDJU Chef — Kitchen Queen",
    image: "/images/budju05.png",
    description:
      "Cooking up gains in the kitchen! Kitchen Queen serves blockchain-fresh recipes with a side of BUDJU sauce.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Gourmet Kitchen" },
      { category: "Outfit", value: "Chef Whites" },
      { category: "Accessory", value: "Golden Whisk" },
      { category: "Expression", value: "Creative" },
    ],
    edition: "6 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 19,
    name: "BUDJU Racer — Speed Demon",
    image: "/images/budju06.png",
    description:
      "Burning rubber and breaking records, Speed Demon races through the crypto highway at maximum velocity.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "Racing Circuit" },
      { category: "Outfit", value: "Racing Suit" },
      { category: "Accessory", value: "Racing Helmet" },
      { category: "Expression", value: "Intense" },
    ],
    edition: "7 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 20,
    name: "BUDJU DJ — Drop Queen",
    image: "/images/budju00.png",
    description:
      "Behind the decks, Drop Queen mixes beats that move the entire BUDJU community. Bass drops harder than market dips.",
    rarity: "Uncommon",
    price: 100,
    traits: [
      { category: "Background", value: "DJ Booth" },
      { category: "Outfit", value: "Sequin Top" },
      { category: "Accessory", value: "Headphones" },
      { category: "Expression", value: "In The Zone" },
    ],
    edition: "8 of 8",
    likes: 0,
    listed: true,
    owner: null,
  },

  // ─── COMMON (10) ───
  {
    id: 21,
    name: "BUDJU Classic — OG Blue",
    image: "/images/budju00.png",
    description:
      "The original. The classic. OG Blue is where it all started — simple, clean, and unmistakably BUDJU.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "BUDJU Blue" },
      { category: "Outfit", value: "Classic Tee" },
      { category: "Accessory", value: "None" },
      { category: "Expression", value: "Happy" },
    ],
    edition: "1 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 22,
    name: "BUDJU Pink — Bubblegum",
    image: "/images/budju01.png",
    description:
      "Sweet as bubblegum and twice as fun. Bubblegum BUDJU pops with pink energy and playful charm.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Pink Candy" },
      { category: "Outfit", value: "Crop Top" },
      { category: "Accessory", value: "Bubble" },
      { category: "Expression", value: "Cheerful" },
    ],
    edition: "2 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 23,
    name: "BUDJU Surf — Wave Rider",
    image: "/images/budju02.png",
    description:
      "Catching waves and catching gains. Wave Rider shreds the surf with her custom BUDJU board.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Ocean Waves" },
      { category: "Outfit", value: "Wetsuit" },
      { category: "Accessory", value: "Surfboard" },
      { category: "Expression", value: "Stoked" },
    ],
    edition: "3 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 24,
    name: "BUDJU Yoga — Zen Master",
    image: "/images/budju03.png",
    description:
      "Finding inner peace on the blockchain. Zen Master BUDJU balances mind, body, and portfolio with grace.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Zen Garden" },
      { category: "Outfit", value: "Yoga Wear" },
      { category: "Accessory", value: "Lotus Flower" },
      { category: "Expression", value: "Peaceful" },
    ],
    edition: "4 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 25,
    name: "BUDJU Street — Skater Girl",
    image: "/images/budju04.png",
    description:
      "Kickflipping through the streets with headphones on and a cap flipped back. Skater Girl keeps it real.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Skate Park" },
      { category: "Outfit", value: "Streetwear" },
      { category: "Accessory", value: "Skateboard" },
      { category: "Expression", value: "Cool" },
    ],
    edition: "5 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 26,
    name: "BUDJU Chill — Lofi Girl",
    image: "/images/budju05.png",
    description:
      "Late nights, lo-fi beats, and a cup of coffee. Lofi Girl studies the charts while the world sleeps.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Cozy Room" },
      { category: "Outfit", value: "Oversized Hoodie" },
      { category: "Accessory", value: "Coffee Cup" },
      { category: "Expression", value: "Cozy" },
    ],
    edition: "6 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 27,
    name: "BUDJU Fitness — Gym Queen",
    image: "/images/budju06.png",
    description:
      "Gains in the gym and gains in the portfolio. Gym Queen lifts heavy and holds even heavier.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Gym Floor" },
      { category: "Outfit", value: "Sports Bra & Leggings" },
      { category: "Accessory", value: "Dumbbells" },
      { category: "Expression", value: "Strong" },
    ],
    edition: "7 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 28,
    name: "BUDJU Travel — Wanderlust",
    image: "/images/budju00.png",
    description:
      "Passport stamped and bags packed, Wanderlust BUDJU explores every corner of the globe — all funded by crypto.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "World Map" },
      { category: "Outfit", value: "Travel Gear" },
      { category: "Accessory", value: "Backpack" },
      { category: "Expression", value: "Excited" },
    ],
    edition: "8 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 29,
    name: "BUDJU Night — Stargazer",
    image: "/images/budju01.png",
    description:
      "Under a blanket of stars, Stargazer dreams about the future of BUDJU while the world below sleeps.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Starry Night" },
      { category: "Outfit", value: "PJs & Blanket" },
      { category: "Accessory", value: "Telescope" },
      { category: "Expression", value: "Wondering" },
    ],
    edition: "9 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
  {
    id: 30,
    name: "BUDJU Crypto — Diamond Hands",
    image: "/images/budju02.png",
    description:
      "She never sells. Diamond Hands holds through every dip, every pump, and every FUD attack. The ultimate HODLer.",
    rarity: "Common",
    price: 50,
    traits: [
      { category: "Background", value: "Chart Candles" },
      { category: "Outfit", value: "BUDJU Merch" },
      { category: "Accessory", value: "Diamond Hands" },
      { category: "Expression", value: "Determined" },
    ],
    edition: "10 of 10",
    likes: 0,
    listed: true,
    owner: null,
  },
];

// ── Helpers ────────────────────────────────────────────────
export const getCollectionStats = () => {
  const total = NFT_COLLECTION.length;
  const available = NFT_COLLECTION.filter((n) => n.listed && !n.owner).length;
  const sold = NFT_COLLECTION.filter((n) => n.owner !== null).length;
  const floorPrice = Math.min(...NFT_COLLECTION.filter((n) => n.listed).map((n) => n.price));
  const totalValue = NFT_COLLECTION.reduce((s, n) => s + n.price, 0);
  return { total, available, sold, floorPrice, totalValue };
};

export const getRarityCount = (rarity: Rarity) =>
  NFT_COLLECTION.filter((n) => n.rarity === rarity).length;
