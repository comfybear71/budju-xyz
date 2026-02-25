import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { APP_NAME } from "@constants/config";
import { useTheme } from "@/context/ThemeContext";
import {
  FaDownload,
  FaImage,
  FaVideo,
  FaFilePdf,
  FaFileExcel,
  FaFileArchive,
  FaFile,
  FaCalendarAlt,
  FaBullhorn,
  FaSpinner,
  FaExternalLinkAlt,
  FaSearch,
  FaTh,
  FaList,
} from "react-icons/fa";

interface MarketingItem {
  name: string;
  path: string;
  url: string;
  downloadUrl: string;
  size: number;
  uploadedAt: string;
  category: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof FaImage; color: string }> = {
  image:        { label: "Images",        icon: FaImage,       color: "from-pink-500 to-rose-500" },
  video:        { label: "Videos",        icon: FaVideo,       color: "from-purple-500 to-indigo-500" },
  document:     { label: "Documents",     icon: FaFilePdf,     color: "from-blue-500 to-cyan-500" },
  spreadsheet:  { label: "Spreadsheets",  icon: FaFileExcel,   color: "from-green-500 to-emerald-500" },
  presentation: { label: "Presentations", icon: FaFile,        color: "from-orange-500 to-amber-500" },
  archive:      { label: "Archives",      icon: FaFileArchive, color: "from-slate-500 to-gray-500" },
  other:        { label: "Other Files",   icon: FaFile,        color: "from-slate-500 to-gray-500" },
};

const Marketing = () => {
  const { isDarkMode } = useTheme();
  const [items, setItems] = useState<MarketingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Marketing - ${APP_NAME}`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", `${APP_NAME} marketing materials, promotional assets, and campaign resources.`);
    }
  }, []);

  useEffect(() => {
    fetch("/api/marketing")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.items || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return "";
    }
  };

  // Group items by subfolder
  const getSubfolder = (path: string) => {
    const parts = path.split("/");
    return parts.length > 1 ? parts[0] : "General";
  };

  const filtered = items.filter((item) => {
    const matchesSearch = search === "" ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.path.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = activeFilter === "all" || item.category === activeFilter;
    return matchesSearch && matchesFilter;
  });

  // Group by subfolder
  const grouped: Record<string, MarketingItem[]> = {};
  for (const item of filtered) {
    const folder = getSubfolder(item.path);
    if (!grouped[folder]) grouped[folder] = [];
    grouped[folder].push(item);
  }

  // Available categories for filter
  const categories = [...new Set(items.map((i) => i.category))];

  const getIcon = (category: string) => {
    const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
    return cfg.icon;
  };

  return (
    <main>
      {/* Hero Section */}
      <section className="pt-24 pb-12 overflow-hidden px-4">
        <div className="max-w-5xl mx-auto relative">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-budju-pink/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-budju-blue/15 rounded-full blur-3xl pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto relative z-10"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-budju-pink/10 border border-budju-pink/20 mb-5">
              <FaBullhorn className="w-3 h-3 text-budju-pink" />
              <span className="text-budju-pink text-xs font-bold uppercase tracking-wider">
                Community Resources
              </span>
            </div>

            <h1 className={`text-3xl md:text-4xl lg:text-5xl font-bold font-display mb-5 leading-tight ${isDarkMode ? "text-white" : "text-gray-900"}`}>
              {APP_NAME}{" "}
              <span className="bg-gradient-to-r from-budju-pink to-budju-blue bg-clip-text text-transparent">
                Marketing
              </span>
            </h1>

            <p className={`text-base md:text-lg leading-relaxed max-w-2xl mx-auto ${isDarkMode ? "text-gray-400" : "text-gray-600"}`}>
              Promotional materials, campaign schedules, branding assets, and marketing ideas — everything you need to spread the word about {APP_NAME}.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content Section */}
      <section className="pb-20 px-4">
        <div className="max-w-5xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <FaSpinner className="animate-spin text-budju-pink mb-4" size={32} />
              <span className={`text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                Loading marketing materials...
              </span>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-400 text-sm mb-2">Failed to load materials</p>
              <p className={`text-xs ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>{error}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20">
              <FaBullhorn className={`mx-auto mb-3 ${isDarkMode ? "text-gray-700" : "text-gray-300"}`} size={32} />
              <p className={`text-sm ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}>
                No marketing materials available yet
              </p>
            </div>
          ) : (
            <>
              {/* Toolbar: Search + Filters + View Toggle */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={`rounded-2xl p-4 mb-6 ${
                  isDarkMode
                    ? "bg-white/[0.03] border border-white/[0.06]"
                    : "bg-white border border-gray-200 shadow-sm"
                }`}
              >
                {/* Search */}
                <div className="relative mb-3">
                  <FaSearch className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`} size={12} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files..."
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm transition-colors ${
                      isDarkMode
                        ? "bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-gray-600 focus:border-budju-pink/40"
                        : "bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-budju-pink/40"
                    } outline-none`}
                  />
                </div>

                {/* Filters + View Toggle */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setActiveFilter("all")}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                        activeFilter === "all"
                          ? "bg-budju-pink/20 text-budju-pink border border-budju-pink/30"
                          : isDarkMode
                            ? "text-gray-500 hover:text-gray-300 border border-transparent"
                            : "text-gray-500 hover:text-gray-700 border border-transparent"
                      }`}
                    >
                      All ({items.length})
                    </button>
                    {categories.map((cat) => {
                      const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.other;
                      const count = items.filter((i) => i.category === cat).length;
                      return (
                        <button
                          key={cat}
                          onClick={() => setActiveFilter(cat)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                            activeFilter === cat
                              ? "bg-budju-pink/20 text-budju-pink border border-budju-pink/30"
                              : isDarkMode
                                ? "text-gray-500 hover:text-gray-300 border border-transparent"
                                : "text-gray-500 hover:text-gray-700 border border-transparent"
                          }`}
                        >
                          {cfg.label} ({count})
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-2 rounded-lg transition-colors ${
                        viewMode === "grid"
                          ? "bg-budju-pink/20 text-budju-pink"
                          : isDarkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <FaTh size={12} />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-2 rounded-lg transition-colors ${
                        viewMode === "list"
                          ? "bg-budju-pink/20 text-budju-pink"
                          : isDarkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <FaList size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Results count */}
              <p className={`text-xs mb-4 ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
                {filtered.length} file{filtered.length !== 1 ? "s" : ""}{search && ` matching "${search}"`}
              </p>

              {/* Grouped content */}
              {Object.entries(grouped).map(([folder, folderItems], groupIdx) => (
                <motion.div
                  key={folder}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + groupIdx * 0.05 }}
                  className="mb-8"
                >
                  {/* Folder header */}
                  {Object.keys(grouped).length > 1 && (
                    <div className="flex items-center gap-2 mb-3">
                      <FaCalendarAlt className="text-budju-pink" size={12} />
                      <h3 className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
                        {folder}
                      </h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        isDarkMode ? "bg-white/[0.06] text-gray-500" : "bg-gray-100 text-gray-500"
                      }`}>
                        {folderItems.length}
                      </span>
                    </div>
                  )}

                  {/* Items */}
                  {viewMode === "grid" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {folderItems.map((item, idx) => {
                        const Icon = getIcon(item.category);
                        const isImage = item.category === "image";
                        const isVideo = item.category === "video";
                        return (
                          <motion.a
                            key={item.path}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.05 * idx }}
                            className={`group rounded-xl overflow-hidden transition-all hover:scale-[1.02] ${
                              isDarkMode
                                ? "bg-white/[0.03] border border-white/[0.06] hover:border-budju-pink/30"
                                : "bg-white border border-gray-200 hover:border-budju-pink/30 shadow-sm"
                            }`}
                          >
                            {/* Preview */}
                            <div className={`aspect-square flex items-center justify-center overflow-hidden ${
                              isDarkMode ? "bg-white/[0.02]" : "bg-gray-50"
                            }`}>
                              {isImage ? (
                                <img
                                  src={item.url}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : isVideo ? (
                                <div className="relative w-full h-full flex items-center justify-center">
                                  <FaVideo className="text-purple-400" size={28} />
                                  <span className="absolute bottom-2 right-2 text-[8px] font-bold bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">
                                    VIDEO
                                  </span>
                                </div>
                              ) : (
                                <Icon className={isDarkMode ? "text-gray-600" : "text-gray-300"} size={28} />
                              )}
                            </div>

                            {/* Info */}
                            <div className="p-2.5">
                              <p className={`text-[11px] font-semibold truncate mb-1 ${
                                isDarkMode ? "text-gray-300" : "text-gray-700"
                              }`}>
                                {item.name}
                              </p>
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
                                  {formatSize(item.size)}
                                </span>
                                <FaExternalLinkAlt className="text-budju-pink opacity-0 group-hover:opacity-100 transition-opacity" size={8} />
                              </div>
                            </div>
                          </motion.a>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {folderItems.map((item, idx) => {
                        const Icon = getIcon(item.category);
                        return (
                          <motion.div
                            key={item.path}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.03 * idx }}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${
                              isDarkMode
                                ? "bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05]"
                                : "bg-white border border-gray-100 hover:bg-gray-50"
                            }`}
                          >
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isDarkMode ? "bg-white/[0.06]" : "bg-gray-100"
                            }`}>
                              {item.category === "image" ? (
                                <img src={item.url} alt="" className="w-full h-full object-cover rounded-lg" loading="lazy" />
                              ) : (
                                <Icon className={isDarkMode ? "text-gray-400" : "text-gray-500"} size={16} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${isDarkMode ? "text-gray-300" : "text-gray-700"}`}>
                                {item.name}
                              </p>
                              <p className={`text-[10px] ${isDarkMode ? "text-gray-600" : "text-gray-400"}`}>
                                {formatSize(item.size)} · {formatDate(item.uploadedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-2 rounded-lg transition-colors ${
                                  isDarkMode ? "hover:bg-white/[0.08] text-gray-500 hover:text-budju-pink" : "hover:bg-gray-100 text-gray-400 hover:text-budju-pink"
                                }`}
                              >
                                <FaExternalLinkAlt size={11} />
                              </a>
                              <a
                                href={item.downloadUrl}
                                download
                                className={`p-2 rounded-lg transition-colors ${
                                  isDarkMode ? "hover:bg-white/[0.08] text-gray-500 hover:text-budju-pink" : "hover:bg-gray-100 text-gray-400 hover:text-budju-pink"
                                }`}
                              >
                                <FaDownload size={11} />
                              </a>
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ))}
            </>
          )}
        </div>
      </section>
    </main>
  );
};

export default Marketing;
