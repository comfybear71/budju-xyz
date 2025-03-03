import { useEffect, useState } from "react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import { ProductProvider } from "./context/ProductContext";
import Cart from "./components/Cart";
import ProductCatalog from "./components/ProductCatalog";
import ShopFaq from "./components/ShopFaq";
import ShopHero from "./components/ShopHero";

const Shop = () => {
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `Shop of ${APP_NAME} - Official Merchandise`;

    // Update meta description
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
        <ShopHero onCartClick={() => setIsCartOpen(true)} />

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
