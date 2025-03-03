import React, { useEffect } from "react";
import { APP_NAME, APP_DESCRIPTION } from "@constants/config";

// Components
import Hero from "./components/Hero";
import NFTShowcase from "./components/NFTShowcase";
import JoinParade from "./components/JoinParade";
import TokenStats from "@/components/common/TokenStats";
import HowToBuyPreview from "./components/HowToBuyPreview";

const Home: React.FC = () => {
  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Update document title
    document.title = `${APP_NAME} - Join the BUDJU Parade`;

    // Update meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.setAttribute("name", "description");
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", APP_DESCRIPTION);

    // Update Open Graph title
    let ogTitleTag = document.querySelector('meta[property="og:title"]');
    if (!ogTitleTag) {
      ogTitleTag = document.createElement("meta");
      ogTitleTag.setAttribute("property", "og:title");
      document.head.appendChild(ogTitleTag);
    }
    ogTitleTag.setAttribute("content", APP_NAME);

    // Update Open Graph description
    let ogDescriptionTag = document.querySelector(
      'meta[property="og:description"]',
    );
    if (!ogDescriptionTag) {
      ogDescriptionTag = document.createElement("meta");
      ogDescriptionTag.setAttribute("property", "og:description");
      document.head.appendChild(ogDescriptionTag);
    }
    ogDescriptionTag.setAttribute("content", APP_DESCRIPTION);

    // Update Open Graph type
    let ogTypeTag = document.querySelector('meta[property="og:type"]');
    if (!ogTypeTag) {
      ogTypeTag = document.createElement("meta");
      ogTypeTag.setAttribute("property", "og:type");
      document.head.appendChild(ogTypeTag);
    }
    ogTypeTag.setAttribute("content", "website");
  }, []); // Empty dependency array means this runs once on component mount

  return (
    <main>
      {/* Hero Section */}
      <Hero />

      {/* Token Stats */}
      <TokenStats />

      {/* NFT Collection Showcase */}
      <NFTShowcase />

      {/* Join Parade Section */}
      <JoinParade />

      {/* How To Buy Preview */}
      <HowToBuyPreview />
    </main>
  );
};

export default Home;
