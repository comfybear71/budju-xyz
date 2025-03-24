// src/features/shop/Shop.tsx
import { useEffect, useState } from "react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import { ProductProvider } from "./context/ProductContext";
import Cart from "./components/Cart";
import ProductCatalog from "./components/ProductCatalog";
import ShopFaq from "./components/ShopFaq";
import ShopHero from "./components/ShopHero";
import { useTheme } from "@/context/ThemeContext"; // Added for theme support

const Shop = () => {
  const { isDarkMode } = useTheme(); // Added theme hook
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `Shop of ${APP_NAME} - Official Merchandise`;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Official BUDJU merchandise store - clothing, accessories, and collectibles for the BUDJU community. Pay with crypto.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Official BUDJU merchandise store - clothing, accessories, and collectibles for the BUDJU community. Pay with crypto.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <ProductProvider>
      <main>
        {/* Hero Section */}
        <ShopHero onCartClick={() => setIsCartOpen(true)} isDarkMode={isDarkMode} />

        {/* Scrolling Banner */}
        <BudjuParadeBanner />

        {/* Product Catalog */}
        <ProductCatalog onCartClick={() => setIsCartOpen(true)} />

        {/* Shop FAQ */}
        <ShopFaq />

        {/* Shopping Cart (Slide-In) */}
        <Cart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      </main>
    </ProductProvider>
  );
};

export default Shop;