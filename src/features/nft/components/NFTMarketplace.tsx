import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { gsap } from "gsap";
import {
  FaSearch,
  FaThLarge,
  FaThList,
  FaSortAmountDown,
  FaHeart,
  FaRegHeart,
  FaShoppingCart,
  FaFilter,
  FaTimes,
} from "react-icons/fa";
import { useTheme } from "@/context/ThemeContext";
import {
  NFT_COLLECTION,
  RARITY_CONFIG,
  type BudjuNFT,
  type Rarity,
} from "../data/nftCollection";
import NFTDetailModal from "./NFTDetailModal";

type SortOption = "price-low" | "price-high" | "rarity" | "name" | "popular";
type ViewMode = "grid" | "list";

const RARITY_ORDER: Rarity[] = [
  "Golden",
  "Legendary",
  "Epic",
  "Rare",
  "Uncommon",
  "Common",
];

const NFTMarketplace = () => {
  const { isDarkMode } = useTheme();
  const gridRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [rarityFilter, setRarityFilter] = useState<Rarity | "All">("All");
  const [sort, setSort] = useState<SortOption>("rarity");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedNFT, setSelectedNFT] = useState<BudjuNFT | null>(null);
  const [likedNFTs, setLikedNFTs] = useState<Set<number>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Filter & sort
  const filteredNFTs = useMemo(() => {
    let items = [...NFT_COLLECTION];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.rarity.toLowerCase().includes(q) ||
          n.traits.some((t) => t.value.toLowerCase().includes(q)),
      );
    }

    // Rarity filter
    if (rarityFilter !== "All") {
      items = items.filter((n) => n.rarity === rarityFilter);
    }

    // Sort
    switch (sort) {
      case "price-low":
        items.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        items.sort((a, b) => b.price - a.price);
        break;
      case "rarity":
        items.sort(
          (a, b) =>
            RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity),
        );
        break;
      case "name":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "popular":
        items.sort((a, b) => b.likes - a.likes);
        break;
    }

    return items;
  }, [search, rarityFilter, sort]);

  // Animate cards on filter change
  useEffect(() => {
    if (gridRef.current) {
      const cards = gridRef.current.querySelectorAll(".nft-market-card");
      gsap.fromTo(
        cards,
        { opacity: 0, y: 20, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          stagger: 0.04,
          duration: 0.4,
          ease: "power2.out",
        },
      );
    }
  }, [filteredNFTs, viewMode]);

  const toggleLike = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLikedNFTs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <section className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Section Title */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <h2
              className={`text-2xl md:text-3xl font-bold font-display mb-2 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              NFT{" "}
              <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
                Marketplace
              </span>
            </h2>
            <p
              className={`text-sm max-w-xl mx-auto ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
            >
              Browse, buy, and collect unique BUDJU NFTs. Pay with BUDJU, USDC,
              or SOL — all proceeds go to the Bank of BUDJU.
            </p>
          </motion.div>

          {/* ── Toolbar ─────────────────────────────────── */}
          <div
            className={`rounded-xl border p-4 mb-6 ${isDarkMode ? "bg-[#0c0c20]/60 border-white/[0.06]" : "bg-white/60 border-gray-200/40"} backdrop-blur-sm`}
          >
            <div className="flex flex-col md:flex-row gap-3 items-center">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <FaSearch
                  className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                />
                <input
                  type="text"
                  placeholder="Search by name, trait, or rarity..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-budju-pink/50 transition-all ${
                    isDarkMode
                      ? "bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600"
                      : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400"
                  }`}
                />
              </div>

              {/* Filter toggle (mobile) */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`md:hidden flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  isDarkMode
                    ? "bg-white/[0.04] border-white/[0.08] text-white"
                    : "bg-gray-50 border-gray-200 text-gray-700"
                }`}
              >
                <FaFilter size={12} /> Filters
              </button>

              {/* Desktop filters */}
              <div
                className={`${showFilters ? "flex" : "hidden"} md:flex flex-wrap items-center gap-3 w-full md:w-auto`}
              >
                {/* Rarity filter */}
                <select
                  value={rarityFilter}
                  onChange={(e) =>
                    setRarityFilter(e.target.value as Rarity | "All")
                  }
                  className={`text-sm px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-budju-pink/50 ${
                    isDarkMode
                      ? "bg-white/[0.04] border-white/[0.08] text-white"
                      : "bg-gray-50 border-gray-200 text-gray-700"
                  }`}
                >
                  <option value="All">All Rarities</option>
                  {RARITY_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                {/* Sort */}
                <div className="flex items-center gap-1">
                  <FaSortAmountDown
                    size={12}
                    className={isDarkMode ? "text-gray-500" : "text-gray-400"}
                  />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    className={`text-sm px-3 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-budju-pink/50 ${
                      isDarkMode
                        ? "bg-white/[0.04] border-white/[0.08] text-white"
                        : "bg-gray-50 border-gray-200 text-gray-700"
                    }`}
                  >
                    <option value="rarity">Rarest First</option>
                    <option value="price-low">Price: Low → High</option>
                    <option value="price-high">Price: High → Low</option>
                    <option value="name">Name A–Z</option>
                    <option value="popular">Most Liked</option>
                  </select>
                </div>

                {/* View toggle */}
                <div
                  className={`flex rounded-lg border overflow-hidden ${isDarkMode ? "border-white/[0.08]" : "border-gray-200"}`}
                >
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-2.5 transition-colors ${
                      viewMode === "grid"
                        ? "bg-budju-pink/20 text-budju-pink"
                        : isDarkMode
                          ? "bg-white/[0.04] text-gray-500 hover:text-white"
                          : "bg-gray-50 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <FaThLarge size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode("list")}
                    className={`p-2.5 transition-colors ${
                      viewMode === "list"
                        ? "bg-budju-pink/20 text-budju-pink"
                        : isDarkMode
                          ? "bg-white/[0.04] text-gray-500 hover:text-white"
                          : "bg-gray-50 text-gray-400 hover:text-gray-700"
                    }`}
                  >
                    <FaThList size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Active filters */}
            {(rarityFilter !== "All" || search.trim()) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {rarityFilter !== "All" && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${RARITY_CONFIG[rarityFilter].bg} ${RARITY_CONFIG[rarityFilter].color} border ${RARITY_CONFIG[rarityFilter].border}`}
                  >
                    {rarityFilter}
                    <FaTimes
                      size={8}
                      className="cursor-pointer"
                      onClick={() => setRarityFilter("All")}
                    />
                  </span>
                )}
                {search.trim() && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${isDarkMode ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                  >
                    "{search}"
                    <FaTimes
                      size={8}
                      className="cursor-pointer"
                      onClick={() => setSearch("")}
                    />
                  </span>
                )}
                <span
                  className={`text-xs ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                >
                  {filteredNFTs.length} result{filteredNFTs.length !== 1 && "s"}
                </span>
              </div>
            )}
          </div>

          {/* ── Collection Stats Bar ───────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Total NFTs", value: "30" },
              {
                label: "Floor Price",
                value: "$50",
              },
              {
                label: "Collection Value",
                value: `$${NFT_COLLECTION.reduce((s, n) => s + n.price, 0).toLocaleString()}`,
              },
              { label: "Owners", value: "0 / 30" },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`text-center p-3 rounded-lg border ${isDarkMode ? "bg-[#0c0c20]/40 border-white/[0.06]" : "bg-white/40 border-gray-200/40"}`}
              >
                <div
                  className={`text-[10px] uppercase tracking-widest font-bold ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
                >
                  {stat.label}
                </div>
                <div
                  className={`text-lg font-bold font-display ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* ── NFT Grid / List ────────────────────────── */}
          {filteredNFTs.length === 0 ? (
            <div
              className={`text-center py-16 ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
            >
              <FaSearch size={32} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No NFTs found</p>
              <p className="text-sm mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : viewMode === "grid" ? (
            // ── Grid View ──
            <div
              ref={gridRef}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredNFTs.map((nft) => (
                <NFTGridCard
                  key={nft.id}
                  nft={nft}
                  liked={likedNFTs.has(nft.id)}
                  onLike={(e) => toggleLike(nft.id, e)}
                  onClick={() => setSelectedNFT(nft)}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          ) : (
            // ── List View ──
            <div ref={gridRef} className="space-y-3">
              {filteredNFTs.map((nft) => (
                <NFTListCard
                  key={nft.id}
                  nft={nft}
                  liked={likedNFTs.has(nft.id)}
                  onLike={(e) => toggleLike(nft.id, e)}
                  onClick={() => setSelectedNFT(nft)}
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Detail Modal ─────────────────────────────── */}
      <AnimatePresence>
        {selectedNFT && (
          <NFTDetailModal
            nft={selectedNFT}
            onClose={() => setSelectedNFT(null)}
            liked={likedNFTs.has(selectedNFT.id)}
            onLike={(e) => toggleLike(selectedNFT.id, e)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default NFTMarketplace;

// ════════════════════════════════════════════════════════════
// Grid Card
// ════════════════════════════════════════════════════════════
const NFTGridCard = ({
  nft,
  liked,
  onLike,
  onClick,
  isDarkMode,
}: {
  nft: BudjuNFT;
  liked: boolean;
  onLike: (e: React.MouseEvent) => void;
  onClick: () => void;
  isDarkMode: boolean;
}) => {
  const cfg = RARITY_CONFIG[nft.rarity];
  const isGolden = nft.rarity === "Golden";

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`nft-market-card group cursor-pointer rounded-xl border overflow-hidden transition-all duration-300 ${
        isDarkMode
          ? `bg-[#0c0c20]/60 ${isGolden ? "border-yellow-400/40 shadow-lg shadow-yellow-400/10" : "border-white/[0.06] hover:border-white/[0.15]"}`
          : `bg-white/60 ${isGolden ? "border-yellow-400/60 shadow-lg shadow-yellow-400/20" : "border-gray-200/40 hover:border-gray-300/60"}`
      } backdrop-blur-sm`}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden">
        {isGolden && (
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-amber-600/20 z-10 pointer-events-none" />
        )}
        <img
          src={nft.image}
          alt={nft.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Rarity badge */}
        <div
          className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold border backdrop-blur-sm ${cfg.bg} ${cfg.color} ${cfg.border}`}
        >
          {nft.rarity}
        </div>

        {/* Like button */}
        <button
          onClick={onLike}
          className="absolute top-2 right-2 p-2 rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
        >
          {liked ? (
            <FaHeart className="text-budju-pink" size={14} />
          ) : (
            <FaRegHeart className="text-white/70" size={14} />
          )}
        </button>

        {/* Edition */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[10px] font-mono bg-black/50 text-white/80 backdrop-blur-sm">
          {nft.edition}
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3
          className={`font-bold text-sm truncate mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {nft.name}
        </h3>
        <p
          className={`text-xs line-clamp-2 mb-3 ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
        >
          {nft.description}
        </p>

        <div className="flex items-center justify-between">
          <div>
            <div
              className={`text-[10px] uppercase tracking-wider ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
            >
              Price
            </div>
            <div
              className={`text-sm font-bold ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}
            >
              ${nft.price.toLocaleString()}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-budju-pink to-budju-blue text-white hover:opacity-90 transition-opacity"
          >
            <FaShoppingCart size={10} />
            Buy
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ════════════════════════════════════════════════════════════
// List Card
// ════════════════════════════════════════════════════════════
const NFTListCard = ({
  nft,
  liked,
  onLike,
  onClick,
  isDarkMode,
}: {
  nft: BudjuNFT;
  liked: boolean;
  onLike: (e: React.MouseEvent) => void;
  onClick: () => void;
  isDarkMode: boolean;
}) => {
  const cfg = RARITY_CONFIG[nft.rarity];
  const isGolden = nft.rarity === "Golden";

  return (
    <motion.div
      whileHover={{ x: 4 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`nft-market-card cursor-pointer rounded-xl border overflow-hidden transition-all duration-300 ${
        isDarkMode
          ? `bg-[#0c0c20]/60 ${isGolden ? "border-yellow-400/40" : "border-white/[0.06] hover:border-white/[0.15]"}`
          : `bg-white/60 ${isGolden ? "border-yellow-400/60" : "border-gray-200/40 hover:border-gray-300/60"}`
      } backdrop-blur-sm`}
    >
      <div className="flex items-center gap-4 p-3">
        {/* Thumbnail */}
        <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
          <img
            src={nft.image}
            alt={nft.name}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3
              className={`font-bold text-sm truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {nft.name}
            </h3>
            <span
              className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.bg} ${cfg.color} ${cfg.border}`}
            >
              {nft.rarity}
            </span>
          </div>
          <p
            className={`text-xs truncate ${isDarkMode ? "text-gray-500" : "text-gray-500"}`}
          >
            {nft.description}
          </p>
        </div>

        {/* Price & actions */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div
              className={`text-sm font-bold ${isDarkMode ? "text-amber-400" : "text-amber-600"}`}
            >
              ${nft.price.toLocaleString()}
            </div>
            <div
              className={`text-[10px] font-mono ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}
            >
              {nft.edition}
            </div>
          </div>

          <button
            onClick={onLike}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
          >
            {liked ? (
              <FaHeart className="text-budju-pink" size={14} />
            ) : (
              <FaRegHeart
                className={isDarkMode ? "text-gray-600" : "text-gray-400"}
                size={14}
              />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-budju-pink to-budju-blue text-white hover:opacity-90 transition-opacity"
          >
            Buy
          </button>
        </div>
      </div>
    </motion.div>
  );
};
