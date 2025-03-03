import { useRef, useEffect, useState } from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { createTiltEffect } from "@/lib/utils/animation";

// NFT trait types
type Rarity = "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";

interface NFTTraits {
  background: string;
  body: string;
  expression: string;
  accessories: string;
  rarity: Rarity;
}

// Interface for NFT data
interface NFT {
  id: number;
  name: string;
  image: string;
  traits: NFTTraits;
}

// Sample NFT data
const nftSamples: NFT[] = [
  {
    id: 1,
    name: "BUDJU #001",
    image: "/images/budju00.png",
    traits: {
      background: "Purple Gradient",
      body: "Classic Blue",
      expression: "Happy",
      accessories: "None",
      rarity: "Common",
    },
  },
  {
    id: 2,
    name: "BUDJU #002",
    image: "/images/budju01.png",
    traits: {
      background: "Yellow Radiance",
      body: "Royal Blue",
      expression: "Excited",
      accessories: "Gold Chain",
      rarity: "Uncommon",
    },
  },
  {
    id: 3,
    name: "BUDJU #003",
    image: "/images/budju02.png",
    traits: {
      background: "Pink Sunset",
      body: "Deep Blue",
      expression: "Cool",
      accessories: "Sunglasses",
      rarity: "Rare",
    },
  },
  {
    id: 4,
    name: "BUDJU #004",
    image: "/images/budju03.png",
    traits: {
      background: "Cosmic Night",
      body: "Aqua Blue",
      expression: "Mysterious",
      accessories: "Star Pendant",
      rarity: "Epic",
    },
  },
  {
    id: 5,
    name: "BUDJU #005",
    image: "/images/budju04.png",
    traits: {
      background: "Digital Sea",
      body: "Light Blue",
      expression: "Focused",
      accessories: "Tech Visor",
      rarity: "Rare",
    },
  },
  {
    id: 6,
    name: "BUDJU #006",
    image: "/images/budju05.png",
    traits: {
      background: "Neon Lights",
      body: "Electric Blue",
      expression: "Energetic",
      accessories: "LED Headband",
      rarity: "Epic",
    },
  },
  {
    id: 7,
    name: "BUDJU #007",
    image: "/images/budju06.png",
    traits: {
      background: "Golden Aura",
      body: "Royal Blue",
      expression: "Confident",
      accessories: "Crown",
      rarity: "Legendary",
    },
  },
];

// Rarity color mapping
const rarityColors = {
  Common: "bg-gray-500",
  Uncommon: "bg-green-500",
  Rare: "bg-blue-500",
  Epic: "bg-purple-500",
  Legendary: "bg-yellow-500",
};

const NFTGallery = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);
  const [selectedNFT, setSelectedNFT] = useState<NFT | null>(null);
  const [filter, setFilter] = useState<Rarity | "All">("All");

  // Filter NFTs based on selected rarity
  const filteredNFTs =
    filter === "All"
      ? nftSamples
      : nftSamples.filter((nft) => nft.traits.rarity === filter);

  // Gallery card animations
  useEffect(() => {
    if (galleryRef.current) {
      const cards = galleryRef.current.querySelectorAll(".nft-card");

      // Animate cards appearance
      gsap.fromTo(
        cards,
        {
          opacity: 0,
          y: 30,
          scale: 0.9,
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.1,
          duration: 0.6,
          ease: "back.out(1.7)",
          scrollTrigger: {
            trigger: galleryRef.current,
            start: "top 80%",
          },
        },
      );

      // Add tilt effect to each card
      cards.forEach((card) => {
        createTiltEffect(card, 10);
      });
    }
  }, [filteredNFTs]);

  // Handle NFT selection for detail view
  const handleNFTSelect = (nft: NFT) => {
    setSelectedNFT(nft);

    // Scroll to detail view if on mobile
    if (window.innerWidth < 768 && selectedNFT !== null) {
      const detailElement = document.getElementById("nft-detail-view");
      if (detailElement) {
        detailElement.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <section
      ref={sectionRef}
      className="py-20 bg-gradient-to-b from-budju-black to-gray-900"
    >
      <div className="budju-container">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-white">EXPLORE THE</span>{" "}
            <span className="text-budju-blue">COLLECTION</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-3xl mx-auto">
            Browse through our preview collection of BUDJU NFTs, each with
            unique traits and varying rarities. These are just a sample of
            what's to come in the full 5,000 NFT collection!
          </p>
        </motion.div>

        {/* Filter Controls */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {(
            ["All", "Common", "Uncommon", "Rare", "Epic", "Legendary"] as const
          ).map((rarity) => (
            <button
              key={rarity}
              onClick={() => setFilter(rarity)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === rarity
                  ? rarity === "All"
                    ? "bg-budju-blue text-white"
                    : `${rarityColors[rarity as Rarity].replace("bg-", "bg-")} text-white`
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {rarity}
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-10 mb-12">
          {/* NFT Gallery Grid */}
          <div ref={galleryRef} className="w-full lg:w-3/5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredNFTs.map((nft) => (
                <div
                  key={nft.id}
                  className={`nft-card budju-card overflow-hidden cursor-pointer transition-all duration-300 ${
                    selectedNFT?.id === nft.id
                      ? "border-budju-pink"
                      : "hover:border-budju-blue"
                  }`}
                  onClick={() => handleNFTSelect(nft)}
                >
                  {/* NFT Image */}
                  <div className="aspect-square overflow-hidden bg-gray-900">
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover transition-all duration-500 hover:scale-110"
                    />
                  </div>

                  {/* NFT Info */}
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-bold text-white">
                        {nft.name}
                      </h3>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded-full ${rarityColors[nft.traits.rarity]}`}
                      >
                        {nft.traits.rarity}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm">
                      Click to view details
                    </p>
                  </div>
                </div>
              ))}

              {filteredNFTs.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-400">
                  No NFTs found matching the selected filter.
                </div>
              )}
            </div>
          </div>

          {/* NFT Detail View */}
          <div id="nft-detail-view" className="w-full lg:w-2/5">
            {selectedNFT ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                className="budju-card p-6 sticky top-24"
              >
                <div className="aspect-square mb-6 rounded-xl overflow-hidden border-2 border-gray-800">
                  <img
                    src={selectedNFT.image}
                    alt={selectedNFT.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <h3 className="text-2xl font-bold text-white mb-4">
                  {selectedNFT.name}
                </h3>

                <div className="mb-6">
                  <div
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${rarityColors[selectedNFT.traits.rarity]}`}
                  >
                    {selectedNFT.traits.rarity} Rarity
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-budju-blue">
                    Traits
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-800/70 p-3 rounded-lg">
                      <div className="text-sm text-gray-400">Background</div>
                      <div className="text-white">
                        {selectedNFT.traits.background}
                      </div>
                    </div>

                    <div className="bg-gray-800/70 p-3 rounded-lg">
                      <div className="text-sm text-gray-400">Body</div>
                      <div className="text-white">
                        {selectedNFT.traits.body}
                      </div>
                    </div>

                    <div className="bg-gray-800/70 p-3 rounded-lg">
                      <div className="text-sm text-gray-400">Expression</div>
                      <div className="text-white">
                        {selectedNFT.traits.expression}
                      </div>
                    </div>

                    <div className="bg-gray-800/70 p-3 rounded-lg">
                      <div className="text-sm text-gray-400">Accessories</div>
                      <div className="text-white">
                        {selectedNFT.traits.accessories}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 text-gray-400 text-sm">
                  <p className="mb-2">
                    Each BUDJU NFT has a unique combination of traits that
                    determine its rarity. Legendary NFTs are the rarest and most
                    valuable in the collection.
                  </p>
                  <p>
                    <span className="text-budju-pink">Note:</span> This is a
                    preview. Actual NFT mint will include more trait variations
                    and unique designs.
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="budju-card p-8 text-center">
                <div className="aspect-square max-w-[200px] mx-auto mb-6 opacity-30">
                  <img
                    src="/images/logo.png"
                    alt="BUDJU Logo"
                    className="w-full h-full object-contain"
                  />
                </div>

                <h3 className="text-xl font-bold text-white mb-4">
                  Select an NFT
                </h3>
                <p className="text-gray-400">
                  Click on any NFT from the collection to view its details and
                  traits.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-6 text-gray-400 text-sm max-w-2xl mx-auto">
          The full BUDJU NFT collection will feature 5,000 unique NFTs with over
          200 different trait combinations. Rarity distribution will be: 60%
          Common, 25% Uncommon, 10% Rare, 4% Epic, and 1% Legendary.
        </div>
      </div>
    </section>
  );
};

export default NFTGallery;
