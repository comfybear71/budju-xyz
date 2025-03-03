import { useEffect } from "react";
import { APP_NAME } from "@constants/config";
import { BudjuParadeBanner } from "@components/common/ScrollingBanner";
import MintingCountdown from "./components/MintingCountdown";
import NFTFaq from "./components/NFTFaq";
import NFTGallery from "./components/NFTGallery";
import NFTHero from "./components/NFTHero";
import NFTHolderBenefits from "./components/NFTHolderBenefits";
import NFTRoadmap from "./components/NFTRoadmap";

const NFT = () => {
  useEffect(() => {
    // Scroll to top on page load
    window.scrollTo(0, 0);

    // Set document title and metadata
    document.title = `NFT Collection - ${APP_NAME}`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        "content",
        "Exclusive BUDJU NFT collection - unique digital collectibles for the BUDJU community with special holder benefits.",
      );
    } else {
      const newMetaDescription = document.createElement("meta");
      newMetaDescription.name = "description";
      newMetaDescription.content =
        "Exclusive BUDJU NFT collection - unique digital collectibles for the BUDJU community with special holder benefits.";
      document.head.appendChild(newMetaDescription);
    }
  }, []);

  return (
    <main>
      {/* Hero Section */}
      <NFTHero />

      {/* Scrolling Banner */}
      <BudjuParadeBanner />

      {/* Minting Countdown */}
      <MintingCountdown />

      {/* NFT Gallery */}
      <NFTGallery />

      {/* NFT Holder Benefits */}
      <NFTHolderBenefits />

      {/* NFT Roadmap */}
      <NFTRoadmap />

      {/* NFT FAQ */}
      <NFTFaq />
    </main>
  );
};

export default NFT;
